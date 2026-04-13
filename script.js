import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 1. CONFIGURAÇÃO SUPABASE
const supabaseUrl = 'https://ynrvgagobvomvpeobztv.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucnZnYWdvYnZvbXZwZW9ienR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzI3ODMsImV4cCI6MjA5MDQ0ODc4M30.ctyIxXg2EWehwBklBgKx3lU7AW-9p1J-fhRvcX-X1mI' 
const supabase = createClient(supabaseUrl, supabaseKey)

// VARIÁVEIS DE ESTADO
let userLogado = null;
let subPerfis = [];
let subPerfilAtivoId = null; 
let arquivoFotoPerfil = null;
let arquivoFotoPost = null; 
let perfilGeral = {};
let postsCache = []; 

// --- INICIALIZAÇÃO ---

window.onload = async () => {
    // 1. Verifica se existe uma sessão ativa
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html'; 
        return; 
    }
    userLogado = session.user;
    
    // 2. Carrega os dados do usuário e os posts
    await carregarDadosIniciais();
    await carregarPosts();
};

async function carregarDadosIniciais() {
    // BUSCA O NOME E DADOS DO PERFIL INSERIDOS NO CADASTRO
    const { data: perfil, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userLogado.id)
        .single();

    if (error) {
        console.error("Erro ao puxar dados do banco:", error);
        return;
    }

    if (perfil) {
        perfilGeral = perfil;

        // PUXANDO O NOME DO BANCO DE DADOS
        const elementoNome = document.getElementById('display-name');
        if (elementoNome) {
            elementoNome.innerText = perfil.name || "Usuário sem nome";
        }

        // Puxando os demais dados cadastrados
        document.getElementById('display-headline').innerText = perfil.headline || "Título não definido";
        document.getElementById('display-about').innerText = perfil.bio || "Sua bio aparecerá aqui...";
        document.getElementById('display-phone').innerText = perfil.phone || "Não informado";
        document.getElementById('display-cpf').innerText = perfil.cpf || "Não informado";
        document.getElementById('display-languages').innerText = perfil.languages || "Não informado";
        document.getElementById('display-email').innerText = userLogado.email;
        
        // Carrega foto de perfil se existir
        if(perfil.avatar_url) {
            document.getElementById('profile-img-display').src = perfil.avatar_url;
        }
        
        switchSkin('main'); 
    }
    await carregarSubPerfis();
}

async function carregarSubPerfis() {
    const { data } = await supabase.from('sub_profiles').select('*').eq('user_id', userLogado.id);
    subPerfis = data || [];
    renderizarAbas();
}

function renderizarAbas() {
    const container = document.getElementById('tabs-container');
    if (!container) return;
    
    container.innerHTML = `<button id="btn-tab-main" class="tab active" onclick="switchSkin('main')">Principal</button>`;
    subPerfis.forEach(s => {
        container.innerHTML += `<button id="btn-tab-${s.id}" class="tab" onclick="switchSkin('sub', ${s.id})">${s.label}</button>`;
    });
    container.innerHTML += `<button class="tab-add" onclick="novoSubPerfil()">+ Especialidade</button>`;
}

// --- LÓGICA DE INTELIGÊNCIA POR HASHTAG (Normalização) ---

function normalizarParaHashtag(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();
}

function detectarDestinoPost(texto) {
    if (!texto) return subPerfilAtivoId;
    
    for (const sub of subPerfis) {
        const hashtagEsperada = `#${normalizarParaHashtag(sub.label)}`;
        const regex = new RegExp(`${hashtagEsperada}\\b`, 'i');
        
        if (regex.test(texto)) {
            return sub.id; 
        }
    }
    return subPerfilAtivoId;
}

// --- LÓGICA DO FEED ---

async function carregarPosts() {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userLogado.id)
        .order('created_at', { ascending: false });

    if (!error) {
        postsCache = data || [];
        renderizarFeed();
    }
}

window.criarPost = async () => {
    const textInput = document.getElementById('post-text');
    const btn = document.getElementById('btn-publicar');
    const text = textInput.value;

    if(!text && !arquivoFotoPost) return alert("Escreva algo ou adicione uma foto!");

    btn.innerText = "Publicando...";
    btn.disabled = true;

    try {
        let publicUrl = null;
        const idDestino = detectarDestinoPost(text);

        if (arquivoFotoPost) {
            const fileName = `${userLogado.id}/${Date.now()}.png`;
            const { error: upError } = await supabase.storage.from('posts').upload(fileName, arquivoFotoPost);
            if (upError) throw upError;
            const { data: urlData } = supabase.storage.from('posts').getPublicUrl(fileName);
            publicUrl = urlData.publicUrl;
        }

        const { error } = await supabase.from('posts').insert([{
            user_id: userLogado.id,
            sub_profile_id: idDestino, 
            content: text,
            image_url: publicUrl
        }]);

        if (error) throw error;

        textInput.value = '';
        removerFotoPost();
        await carregarPosts(); 

        if (idDestino !== subPerfilAtivoId && idDestino !== null) {
            const nomeAba = subPerfis.find(s => s.id === idDestino)?.label;
            alert(`Post direcionado para #${normalizarParaHashtag(nomeAba)}`);
        }

    } catch (err) {
        alert("Erro ao publicar post.");
    } finally {
        btn.innerText = "Publicar";
        btn.disabled = false;
    }
};

function renderizarFeed() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    container.innerHTML = '';
    
    const filtrados = subPerfilAtivoId 
        ? postsCache.filter(p => p.sub_profile_id === subPerfilAtivoId)
        : postsCache;

    if(filtrados.length === 0) {
        container.innerHTML = '<p style="grid-column: span 3; text-align: center; color: #999; padding: 40px;">Nada publicado aqui ainda.</p>';
        return;
    }

    filtrados.forEach(p => {
        const el = document.createElement('div');
        el.className = 'post-item';
        if (p.image_url) {
            el.innerHTML = `<img src="${p.image_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            el.style.background = "#f3f2ef";
            el.style.padding = "10px";
            el.innerHTML = `<span style="font-size: 10px; color: #666;">${p.content}</span>`;
        }
        container.appendChild(el);
    });
}

// --- NAVEGAÇÃO E EDIÇÃO ---

window.switchSkin = (mode, id = null) => {
    encerrarEdicaoVisual(); 
    const headline = document.getElementById('display-headline');
    const subBio = document.getElementById('display-sub-bio');
    const subBioLabel = document.getElementById('sub-bio-label');
    const banner = document.getElementById('profile-banner');

    if (mode === 'main') {
        subPerfilAtivoId = null;
        headline.innerText = perfilGeral.headline || "Título";
        subBioLabel.innerText = "Visão Geral";
        subBio.innerText = "Selecione uma aba para filtrar seus posts.";
        banner.style.background = "var(--rainbow)";
        if(perfilGeral.avatar_url) document.getElementById('profile-img-display').src = perfilGeral.avatar_url;
    } else {
        const sub = subPerfis.find(s => s.id === id);
        subPerfilAtivoId = id;
        headline.innerText = sub.headline;
        subBioLabel.innerText = "Especialidade: " + sub.label;
        subBio.innerText = sub.bio;
        banner.style.background = sub.color_theme || "var(--furta-cor)";
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const btnAtivo = id ? document.getElementById(`btn-tab-${id}`) : document.getElementById('btn-tab-main');
    if (btnAtivo) btnAtivo.classList.add('active');

    renderizarFeed();
};

window.confirmarNovoSubPerfil = async () => {
    const label = document.getElementById('input-nome-subperfil').value;
    if (!label) return alert("Digite um nome!");

    const { data, error } = await supabase.from('sub_profiles').insert([{ 
        user_id: userLogado.id, 
        label, 
        headline: 'Especialista em ' + label, 
        bio: 'Bio desta especialidade...', 
        color_theme: 'var(--furta-cor)' 
    }]).select();

    if(!error && data[0]) {
        fecharModal();
        await carregarSubPerfis(); 
        setTimeout(() => {
            switchSkin('sub', data[0].id);
        }, 200);
    }
};

// --- AUXILIARES ---

window.toggleEditSection = (fields, btn) => {
    if (subPerfilAtivoId && (fields.includes('display-name') || fields.includes('display-about'))) {
        alert("Edite isso na aba Principal.");
        return;
    }

    const isEditing = document.getElementById(fields[0]).contentEditable === "true";
    fields.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.contentEditable = !isEditing;
            el.classList.toggle('editing-active', !isEditing);
        }
    });
    btn.innerText = isEditing ? "✏️" : "✅";
    document.getElementById('save-button').style.display = isEditing ? 'none' : 'block';
};

function encerrarEdicaoVisual() {
    document.querySelectorAll('.editable-field').forEach(el => {
        el.contentEditable = "false";
        el.classList.remove('editing-active');
    });
    document.querySelectorAll('.edit-btn').forEach(b => b.innerText = "✏️");
    document.getElementById('save-button').style.display = 'none';
}

window.saveProfile = async () => {
    try {
        if (subPerfilAtivoId) {
            await supabase.from('sub_profiles').update({ 
                headline: document.getElementById('display-headline').innerText, 
                bio: document.getElementById('display-sub-bio').innerText 
            }).eq('id', subPerfilAtivoId);
        } else {
            const payload = {
                name: document.getElementById('display-name').innerText,
                headline: document.getElementById('display-headline').innerText,
                bio: document.getElementById('display-about').innerText,
                languages: document.getElementById('display-languages').innerText,
                phone: document.getElementById('display-phone').innerText,
                cpf: document.getElementById('display-cpf').innerText
            };
            if (arquivoFotoPerfil) {
                const fileName = `avatar_${userLogado.id}.png`;
                await supabase.storage.from('avatars').upload(fileName, arquivoFotoPerfil, { upsert: true });
                const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
                payload.avatar_url = urlData.publicUrl;
            }
            await supabase.from('profiles').update(payload).eq('id', userLogado.id);
        }
        location.reload(); 
    } catch (err) {
        alert("Erro ao salvar.");
    }
};

window.previewImage = (e) => {
    arquivoFotoPerfil = e.target.files[0];
    document.getElementById('profile-img-display').src = URL.createObjectURL(arquivoFotoPerfil);
    document.getElementById('save-button').style.display = 'block';
};

window.previewImagemPost = (e) => {
    arquivoFotoPost = e.target.files[0];
    document.getElementById('post-img-preview').src = URL.createObjectURL(arquivoFotoPost);
    document.getElementById('post-img-preview-container').style.display = 'block';
};

window.removerFotoPost = () => {
    arquivoFotoPost = null;
    document.getElementById('post-img-preview-container').style.display = 'none';
};

window.deslogar = async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
};

window.novoSubPerfil = () => { document.getElementById('modal-especialidade').style.display = 'flex'; document.getElementById('input-nome-subperfil').focus(); };
window.fecharModal = () => { document.getElementById('modal-especialidade').style.display = 'none'; document.getElementById('input-nome-subperfil').value = ''; };