// Lógica para la página de Información con Imagen

async function loadInfo(param) {
    
    const titleEl = document.getElementById('infoTitle');
    const statusEl = document.getElementById('infoStatus');
    const containerEl = document.getElementById('infoImageContainer');
console.log('Cargando información para:', param);
    if (!titleEl || !statusEl || !containerEl) return;

    // Formatear el título, ej: "PersonalShopper" -> "Personal Shopper", "Online" -> "Online Shopper"
    let formattedTitle = param.replace(/([A-Z])/g, ' $1').trim(); // "OnlineShopper" -> "Online Shopper"
    titleEl.textContent = formattedTitle;


    try {
        
        const response = await fetch(`/.netlify/functions/info-image?id=${param}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }

        const { imageUrl } = await response.json();
console.log('img URL:', imageUrl);
        if (!imageUrl) throw new Error("No se encontró una imagen para este identificador.");

        containerEl.innerHTML = `<img src="${imageUrl}" alt="${formattedTitle}" style="max-width: 100%; border-radius: 15px; margin-top: 1rem;">`;
        statusEl.style.display = 'none';
        containerEl.style.display = 'block';

    } catch (err) {
        statusEl.innerHTML = `<p class="error-msg">⚠️ Error al cargar: ${err.message}</p>`;
    }
}