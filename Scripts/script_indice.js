import {showError, showSuccess, showErrorToast, showSuccessToast, showinfo, showInfoHTML} from './sweetalert2.js'
import {loadSupabase, loadSupaBseWithAuth} from './supabase.js'
const client= await loadSupaBseWithAuth();

document.getElementById('btn_google').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: '/index.html'
            }
        });
        if (error) {
            console.error('Error during Google sign-in:', error);
            showErrorToast('Error al iniciar sesión con Google. Por favor, inténtalo de nuevo.');
        } else {
            showSuccessToast('Redirigiendo a Google para iniciar sesión...');
        }
    } catch (error) {
        console.error('Unexpected error during Google sign-in:', error);
        showErrorToast('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
    }
});

window.onload = function() {
    const an = document.getElementById('anio');
    const fecha = new Date();
    const año = fecha.getFullYear();
    an.textContent = año;
}