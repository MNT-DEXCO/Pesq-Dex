    // ==========================================
    // --- LÓGICA DE LOGIN COM MOTOR IAM + HONEYPOT ---
    // ==========================================
    let currentUser = null;
    let isLoggingInProcess = false; // Flag para evitar condições de corrida (Race Condition)

    window.onload = () => { verificarPrimeiroAcesso(); init(); };
    
    function verificarPrimeiroAcesso() { 
        let user = localStorage.getItem('dexco_user'); 
        if(!user) { 
            document.getElementById('registro-modal').style.display = 'flex'; 
            popularSelectUsuarios(); 
        } else { 
            currentUser = JSON.parse(user); 
            aplicarPermissoes(); 
            atualizarNomeTopo(); 
            document.getElementById('registro-modal').style.display = 'none'; 
        } 
    }
    
    function atualizarNomeTopo() { 
        let el = document.getElementById('nav-user-name'); 
        if(el) el.innerText = currentUser ? `👤 ${currentUser.nome}` : `👤 Aguardando...`; 
    }

    // NOVA FUNÇÃO ULTRA-BLINDADA
    function obterNivelAcesso(u) {
        if (!u) return 'bloqueado';
        
        let nivel = undefined;
        try {
            if (u.permissoes && typeof u.permissoes === 'object') {
                // Procura a chave (case-insensitive) para garantir compatibilidade
                const chaves = Object.keys(u.permissoes);
                const chaveReal = chaves.find(k => k.toLowerCase() === CHAVE_IAM_APP.toLowerCase());
                if (chaveReal) nivel = u.permissoes[chaveReal];
            }
        } catch(e) {}

        if (!nivel || nivel === '') {
             nivel = u.role === 'master' ? 'master' : (u.role === 'padrao' ? 'pleno' : 'bloqueado');
        }
        return nivel;
    }
    
    function popularSelectUsuarios() { 
        let sel = document.getElementById('reg-nome-select'); 
        if(!sel) return; 
        let usrs = JSON.parse(localStorage.getItem('dexco_usr')) || []; 
        sel.innerHTML = '<option value="">-- Escolha o seu nome --</option>'; 
        usrs.forEach(u => { 
            if (obterNivelAcesso(u) !== 'bloqueado') {
                sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`; 
            }
        }); 
        verificarStatusSenhaUsuario(); 
    }

    function verificarStatusSenhaUsuario() { 
        let id = document.getElementById('reg-nome-select').value; 
        let usrs = JSON.parse(localStorage.getItem('dexco_usr')) || []; 
        let u = usrs.find(x => x.id === id); 
        let confirmInput = document.getElementById('reg-senha-confirm'); 
        document.getElementById('reg-senha').value = ''; 
        confirmInput.value = ''; 
        confirmInput.style.display = (u && !u.senha) ? 'block' : 'none'; 
    }

    async function fazerLogin() {
        if(isLoggingInProcess) return;
        
        let id = document.getElementById('reg-nome-select').value; 
        let s = document.getElementById('reg-senha').value.trim(); 
        let sc = document.getElementById('reg-senha-confirm').value.trim();
        
        if(!id || !s) return alert("Selecione o seu utilizador e digite a palavra-passe.");
        
        let usrs = JSON.parse(localStorage.getItem('dexco_usr')) || []; 
        let uLocal = usrs.find(x => x.id === id); 
        if(!uLocal) return alert("Utilizador não encontrado.");

        let nivelAcesso = obterNivelAcesso(uLocal);
        if(nivelAcesso === 'bloqueado') return alert("ACESSO NEGADO: Não tem permissão para entrar.");

        if(!uLocal.senha) { 
            if(s !== sc) return alert("As palavras-passe não conferem."); 
        } else if(uLocal.senha !== s) {
            return alert("Palavra-passe incorreta.");
        }
        
        isLoggingInProcess = true; // Bloqueia o onSnapshot temporariamente

        try {
            const userRef = db.collection('usuarios').doc(id);
            const userDoc = await userRef.get();
            if(!userDoc.exists) { isLoggingInProcess = false; return alert("Utilizador não existe no sistema central."); }
            
            const uNuvem = userDoc.data();
            let dataIso = new Date().toISOString();
            
            // VERIFICAÇÃO SEVERA DE SESSÃO DUPLA (HONEYPOT)
            if (uNuvem.sessaoAtiva && uNuvem.sessaoAtiva !== "") {
                
                let novasPermissoes = uNuvem.permissoes || {};
                novasPermissoes[CHAVE_IAM_APP] = 'bloqueado';
                
                await userRef.update({ senha: '', permissoes: novasPermissoes });
                
                await db.collection('logs_acessos').add({
                    usuarioId: id, nome: uNuvem.nome, app: 'Estoque', loginAt: dataIso,
                    status: '🚫 CONTA SUSPENSA: Acesso Duplo', token: 'HONEYPOT_TRIGGER'
                });
                
                isLoggingInProcess = false;
                document.getElementById('registro-modal').style.display = 'none';
                document.getElementById('kickout-modal').style.display = 'flex';
                return; 
            }
            
            let sessionToken = 'tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

            // Limpeza de logs antigos
            const limiteDiasIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            db.collection('logs_acessos').where('usuarioId', '==', id).get().then(snap => {
                snap.forEach(doc => { if(doc.data().loginAt < limiteDiasIso) doc.ref.delete(); });
            }).catch(e => console.warn(e));

            await userRef.update({ senha: uLocal.senha || s, sessaoAtiva: sessionToken, ultimoLogin: dataIso });

            let logRef = await db.collection('logs_acessos').add({
                usuarioId: id, nome: uLocal.nome, app: 'Estoque', loginAt: dataIso,
                status: '🟢 Ativa', token: sessionToken
            });

            currentUser = { id: uLocal.id, nome: uLocal.nome, role: nivelAcesso, token: sessionToken, logId: logRef.id }; 
            localStorage.setItem('dexco_user', JSON.stringify(currentUser));
            
            document.getElementById('registro-modal').style.display = 'none'; 
            aplicarPermissoes(); 
            atualizarNomeTopo(); 
            exibirToast(`Bem-vindo(a), ${uLocal.nome}!`, "sucesso"); 
            renderGrid('', true); 
            renderMetrics();

            // Reativa o onSnapshot de forma segura 3 segundos após o login
            setTimeout(() => { isLoggingInProcess = false; }, 3000);

        } catch (error) {
            isLoggingInProcess = false;
            alert("Erro de ligação ao servidor IAM.");
            console.error(error);
        }
    }

    async function fazerLogout() { 
        if(confirm("Deseja fechar a sessão?")) { 
            if(currentUser) {
                try {
                    await db.collection('usuarios').doc(currentUser.id).update({ sessaoAtiva: '' });
                    if(currentUser.logId) {
                        await db.collection('logs_acessos').doc(currentUser.logId).update({
                            status: '⚪ Finalizado', logoutAt: new Date().toISOString()
                        });
                    }
                } catch(e) {}
            }
            localStorage.removeItem('dexco_user'); 
            location.reload(); 
        } 
    }

    async function fazerLogoutSemConfirmacao() { 
        if(currentUser && currentUser.logId) {
            await db.collection('logs_acessos').doc(currentUser.logId).update({
                status: '⚫ Bloqueado pelo IAM', logoutAt: new Date().toISOString()
            }).catch(e => {});
        }
        localStorage.removeItem('dexco_user'); 
        location.reload(); 
    }

    function exibirBloqueioSevero() {
        localStorage.removeItem('dexco_user');
        document.getElementById('kickout-modal').style.display = 'flex';
    }

    // --- ESCUTA EM TEMPO REAL DO IAM ---
    db.collection('usuarios').onSnapshot(snap => { 
        let usrs = []; 
        snap.forEach(doc => usrs.push({ id: doc.id, ...doc.data() })); 
        usrs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        localStorage.setItem('dexco_usr', JSON.stringify(usrs)); 
        
        if(!currentUser) {
            popularSelectUsuarios(); 
        } else {
            if(isLoggingInProcess) return; // Ignora o snapshot durante o processo de entrada!

            let uData = usrs.find(x => x.id === currentUser.id);
            if(uData) {
                let nivel = obterNivelAcesso(uData);
                
                if(nivel === 'bloqueado' && (!uData.senha || uData.senha === '')) {
                     exibirBloqueioSevero();
                     return;
                }

                if(nivel === 'bloqueado') {
                     fazerLogoutSemConfirmacao();
                } else if(nivel !== currentUser.role) {
                     currentUser.role = nivel;
                     localStorage.setItem('dexco_user', JSON.stringify(currentUser));
                     aplicarPermissoes();
                }
            } else {
                fazerLogoutSemConfirmacao();
            }
        }
    }, error => { console.error("Erro IAM: ", error); });

    function aplicarPermissoes() {
        if(!currentUser) return; 
        let isMaster = currentUser.role === 'master';
        document.getElementById('btnGerirTipos').style.display = isMaster ? 'flex' : 'none';
        document.getElementById('btnImportarExcel').style.display = isMaster ? 'flex' : 'none';
        document.getElementById('btnBackup').style.display = isMaster ? 'flex' : 'none';
    }
