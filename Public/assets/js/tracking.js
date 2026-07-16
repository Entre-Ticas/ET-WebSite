// Lógica de Rastreo de Paquetes

async function buscarTracking() {
    const num = document.getElementById('trackingNum').value.trim();
    const resBox = document.getElementById('resultadoRastreo');
    const infoDetalle = document.getElementById('infoDetalle');

    if (!num) return alert('Por favor ingresa un número de guía.');

    infoDetalle.innerHTML = '<p>Buscando...</p>';
    resBox.style.display = 'block';

    try {
        const response = await fetch(`/.netlify/functions/tracking?num=${encodeURIComponent(num)}`);

        if (response.status === 404) {
            infoDetalle.innerHTML = '<p>❌ No se encontró el número de guía.</p>';
            return;
        }
        if (!response.ok) throw new Error('Error en el servidor.');

        const { info, historial } = await response.json();

        const ultimoEstado = historial.length > 0
            ? historial[historial.length - 1].detalle_estado
            : info.tracking_status || '—';

        const waMsg = `Consulta Tracking: ${num}\nÚltimo estado: ${ultimoEstado}`;
        const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`;

        const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-CR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) : '—';

        const infoItems = [
            { label: 'Estado',              value: ultimoEstado },
            { label: 'Cliente',             value: info.cliente },
            { label: 'Producto',            value: info.producto },
            { label: 'Tienda',              value: info.nombre_tienda },
            { label: 'Fecha de Compra',     value: formatFecha(info.fecha_compra) },
            { label: 'Fecha Entrega Miami', value: formatFecha(info.fecha_entrega_miami) },
        ].filter(i => i.value && i.value !== '—');

        const infoHTML = `<div class="tracking-info-estado-wrap">
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 15px;">
                    <span class="tracking-estado-badge" style="margin: 0;">${ultimoEstado}</span>
                </div>
            </div>` +
            infoItems.slice(1).map(i =>
                `<div class="tracking-info-row"><span class="tracking-info-label">${i.label}:</span> ${i.value}</div>`
            ).join('');

        const filasHistorial = historial.map(r => {
            const fecha = new Date(r.fecha_hora).toLocaleString('es-CR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const nota = r.nota ? `<br><span class="tracking-nota">${r.nota}</span>` : '';
            return `<tr><td>${r.detalle_estado}${nota}</td><td>${fecha}</td></tr>`;
        }).join('');

        const historialHTML = historial.length > 0 ? `
            <div class="tracking-table-wrapper">
                <table class="tracking-table">
                    <thead><tr><th>Estado</th><th>Fecha</th></tr></thead>
                    <tbody>${filasHistorial}</tbody>
                </table>
            </div>` : '';

        infoDetalle.innerHTML = `
            <div class="tracking-info-box">${infoHTML}</div>
            ${historialHTML}
            <a href="${waLink}" target="_blank" class="btn-whatsapp-track">
                <i class="fab fa-whatsapp"></i> Consultar por WhatsApp
            </a>`;

    } catch (error) {
        console.error(error);
        infoDetalle.innerHTML = `<p>⚠️ Error: ${error.message}</p>`;
    }
}
