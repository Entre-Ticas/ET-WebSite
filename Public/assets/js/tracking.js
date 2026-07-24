// Lógica de Rastreo de Paquetes

function setStatusMessage(message, isError = false) {
    const infoDetalle = document.getElementById('infoDetalle');
    infoDetalle.innerHTML = `<p>${message}</p>`;
    infoDetalle.style.display = message ? 'block' : 'none';
    if (isError) {
        infoDetalle.querySelector('p').style.color = 'red';
    }
}

function resetTrackingView() {
    const resBox = document.getElementById('resultadoRastreo');
    const template = document.getElementById('trackingTemplate');
    
    resBox.style.display = 'none';
    setStatusMessage(''); // Oculta y limpia el mensaje de estado
    if (template) {
        template.style.display = 'none'; // Oculta la plantilla de resultados
    }
}

async function buscarTracking() {
    const num = document.getElementById('trackingNum').value.trim();
    const resBox = document.getElementById('resultadoRastreo');
    const trackingTemplate = document.getElementById('trackingTemplate');

    if (!num) return alert('Por favor ingresa un número de guía.');

    resetTrackingView();
    resBox.style.display = 'block';
    setStatusMessage('Buscando...');

    try {
        const response = await fetch(`/.netlify/functions/tracking?num=${encodeURIComponent(num)}`);

        if (response.status === 404) {
            setStatusMessage('❌ No se encontró el número de guía.', true);
            return;
        }
        if (!response.ok) throw new Error('Error en el servidor.');

        const { info, historial } = await response.json();

        // Ocultar mensaje "Buscando..."
        setStatusMessage('');

        // Mostrar la plantilla de resultados
        trackingTemplate.style.display = 'block';

        // --- Poblar la plantilla con datos ---

        const ultimoEstado = historial.length > 0
            ? historial[historial.length - 1].detalle_estado
            : info.tracking_status || '—';

        // 1. Rellenar campos principales
        trackingTemplate.querySelector('[data-field="ultimoEstado"]').textContent = ultimoEstado;

        const waMsg = `Consulta Tracking: ${num}\nÚltimo estado: ${ultimoEstado}`;
        const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`;
        trackingTemplate.querySelector('[data-field="whatsappLink"]').href = waLink;

        const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-CR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) : '—';

        // 2. Crear y añadir las filas de información
        const infoItems = [
            { label: 'Cliente',             value: info.cliente },
            { label: 'Producto',            value: info.producto },
            { label: 'Tienda',              value: info.nombre_tienda },
            { label: 'Fecha de Compra',     value: formatFecha(info.fecha_compra) },
            { label: 'Fecha Entrega Miami', value: formatFecha(info.fecha_entrega_miami) },
        ].filter(i => i.value && i.value !== '—');
        
        const infoRowsContainer = trackingTemplate.querySelector('.tracking-info-rows');
        infoRowsContainer.innerHTML = ''; // Limpiar contenido previo
        infoItems.forEach(item => {
            const row = document.createElement('div');
            row.className = 'tracking-info-row';
            row.innerHTML = `<span class="tracking-info-label">${item.label}:</span> ${item.value}`;
            infoRowsContainer.appendChild(row);
        });

        // 3. Rellenar la tabla de historial
        const historialTableWrapper = trackingTemplate.querySelector('.tracking-table-wrapper');
        const historialTbody = historialTableWrapper.querySelector('tbody');
        const rowTemplate = document.getElementById('historialRowTemplate');
        
        historialTbody.innerHTML = ''; // Limpiar contenido previo

        if (historial.length > 0 && rowTemplate) {
            historialTableWrapper.style.display = 'block';
            historial.forEach(r => {
                const clone = rowTemplate.content.cloneNode(true); // Clonamos la plantilla de fila
                const notaHTML = r.nota ? `<br><span class="tracking-nota">${r.nota}</span>` : '';
                
                clone.querySelector('[data-field="detalleEstado"]').innerHTML = r.detalle_estado + notaHTML;
                clone.querySelector('[data-field="fecha"]').textContent = new Date(r.fecha_hora).toLocaleString('es-CR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                historialTbody.appendChild(clone);
            });
        } else {
            historialTableWrapper.style.display = 'none';
        }

    } catch (error) {
        console.error(error);
        setStatusMessage(`⚠️ Error: ${error.message}`, true);
    }
}
