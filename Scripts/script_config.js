import {showError, showSuccess, showErrorToast, showSuccessToast, showinfo, showInfoHTML, loadSweetAlert2} from './sweetalert2.js'
import {loadSupaBseWithAuth} from './supabase.js'

// --- Tema (modo oscuro/claro) ---
const THEME_STORAGE_KEY = 'CMS_THEME'

function getStoredTheme(){
    const raw = (localStorage.getItem(THEME_STORAGE_KEY) || '').toString().trim().toLowerCase()
    if (raw === 'light' || raw === 'claro') return 'light'
    return 'dark'
}

function applyTheme(theme){
    const normalized = theme === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = normalized

    const btn = document.getElementById('modo-oscuro-btn')
    if (btn){
        btn.setAttribute('aria-checked', String(normalized === 'dark'))
    }
}

function toggleTheme(){
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    const next = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
    return next
}

// Aplicar tema lo antes posible (evita flash si el usuario eligió claro)
applyTheme(getStoredTheme())

const client= await loadSupaBseWithAuth();

async function getCurrentUserId(){
    const fromStorage = (localStorage.getItem('UserID') || '').toString().trim()
    if (fromStorage && fromStorage !== 'N/A') return fromStorage

    try{
        const { data, error } = await client.auth.getUser()
        if (error) return null
        return data?.user?.id || null
    }catch{
        return null
    }
}

async function eliminarCuenta(){
    const userId = await getCurrentUserId()
    if (!userId){
        await showErrorToast('No se encontró un usuario autenticado.')
        return
    }

    const Swal = await loadSweetAlert2()
    const result = await Swal.fire({
        title: 'Eliminar cuenta',
        text: 'Esta acción es irreversible. ¿Querés continuar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Eliminar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true
    })

    if (!result.isConfirmed) return

    await Swal.fire({
        title: 'Eliminando…',
        text: 'Por favor espera',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
    })

    try{
        // Función dedicada de Supabase (requiere service_role)
        const { error } = await client.auth.admin.deleteUser(userId)
        if (error){
            Swal.close()
            await showError('Error al eliminar la cuenta', error.message || String(error))
            return
        }

        try { await client.auth.signOut() } catch { /* ignore */ }
        localStorage.clear()
        Swal.close()
        await showSuccess('Cuenta eliminada', 'Tu cuenta fue eliminada correctamente.')
        window.location.href = '/index.html'
    }catch(e){
        Swal.close()
        await showError('Error al eliminar la cuenta', e?.message || String(e))
    }
}

window.onload = function() {
    const anioEl = document.getElementById('anio')
    if (anioEl) anioEl.textContent = new Date().getFullYear()

    const pfpEl = document.getElementById('pfp')
    const photo = (localStorage.getItem('UserPhoto') || '').toString().trim()
    if (pfpEl){
        if (photo) pfpEl.src = photo
        else pfpEl.removeAttribute('src')
    }

    const datos = document.getElementById('Datos_cuenta')
    if (datos){
        const userName = (localStorage.getItem('UserName') || '').toString().trim()
        datos.textContent = 'Nombre de usuario: ' + (userName || '—')
    }
}

window.cerrarSesion=function() {
    localStorage.clear()
    window.location.href = '/index.html'
}

const idiomaBtn = document.getElementById('idioma-btn')
if (idiomaBtn){
    idiomaBtn.addEventListener('click', async () => {
        await showinfo('Próximamente')
    })
}

const modoOscuroBtn = document.getElementById('modo-oscuro-btn')
if (modoOscuroBtn){
    modoOscuroBtn.addEventListener('click', async () => {
        const next = toggleTheme()
        await showSuccessToast(next === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado')
    })
}

const transparenciaBtn = document.getElementById('transparencia-btn')
if (transparenciaBtn){
    transparenciaBtn.addEventListener('click', async () => {
        await showinfo('Próximamente')
    })
}

const eliminarCuentaBtn = document.getElementById('eliminar-cuenta-btn')
if (eliminarCuentaBtn){
    eliminarCuentaBtn.addEventListener('click', async () => {
        await eliminarCuenta()
    })
}