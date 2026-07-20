 function init() {
    getExchange();
    
    const price = document.getElementById('price0');
    const pound = document.getElementById('pound0');
    const cbkImp = document.getElementById('cbkImp0');

    if (price) price.addEventListener('input', () => calculate(0));
    if (pound) pound.addEventListener('input', () => calculate(0));
    if (cbkImp) cbkImp.addEventListener('change', () => enableProductWeightLabel2(0));

    // Agregamos la lógica para los radio buttons de unidad dentro de init
    document.querySelectorAll('input[name="unidad0"]').forEach(radio => {
        radio.addEventListener('change', function() {
            let id = parseInt(this.id.replace(/\D/g, ""), 10); 
            enableProductWeightLabel(id); // Habilita el input si estaba deshabilitado

            let lbOrKg = 0;
            let poundField = document.getElementById(`pound${id}`);
            let currentValue = parseFloat(poundField.value) || 0;

            // Realiza la conversión visual del valor actual al cambiar de unidad
            if (this.id.startsWith('Lb')) {
                lbOrKg = (currentValue * 2.20462).toFixed(2);
            } else if (this.id.startsWith('Kg')) {
                lbOrKg = (currentValue / 2.20462).toFixed(2);
            }
            
            poundField.value = lbOrKg;
            calculate(id);
        });
    });
    
 }

async function getExchange() {
  try {	
	document.getElementById('exchange2').textContent = "¢" + TC;
  } catch (error) {
	console.error("Error al obtener el tipo de cambio: ", error);
  }
}

function calculate(id) {

  const get = (name) => document.getElementById(`${name}${id}`);
  const priceInput = get(`price`);
  const results = get(`results`);

  let price = parseFloat(priceInput.value);
  const cbkDollar = get("cbkDollar")?.checked;

  if (isNaN(price) || isNaN(tipoCambio)) {
    results.style.display = "none";
    return;
  }

  // ---------- IMPUESTO OPCIONAL ----------
  if (id === 0) {

    const chkImp = document.getElementById(`cbkImp${id}`);
    const impRow = document.getElementById(`impRow${id}`);

    if (chkImp?.checked) {
      const impPercent = parseFloat(document.getElementById(`impPercent${id}`).value) || 0;
      const extraTax = price * (impPercent / 100);

      price += extraTax;

      document.getElementById(`impPercentLabel${id}`).textContent = impPercent;
      document.getElementById(`impAmount${id}`).textContent = extraTax.toFixed(2);

      impRow.style.display = "block";

    } else {
      impRow.style.display = "none";
    }
  }

  // ---------- COMISION ----------
  const feePercent = cbkDollar ? 0.04 : 0.08;
  const fee = price * feePercent;

  // ---------- PESO ----------
  let weight = 0;

  if (id === 0) {

    const pound = parseFloat(get("pound")?.value) || 0;

    if (!document.getElementById(`Lb${id}`).checked && !document.getElementById(`Kg${id}`).checked) {
      alert("Por favor, seleccione una opción: Kilos o Libras.");
      return;
    }

    if (document.getElementById(`Lb${id}`).checked) {
      weight = pound * precioLibraAmazon;
    }

    if (document.getElementById(`Kg${id}`).checked) {
      weight = pound * precioKgAmazon;
    }
    get(`amountPound`).textContent = weight.toFixed(2);
  }

  // ---------- TOTALES ----------
  const totalUsd = price + fee + weight;
  const totalCrc = totalUsd * tipoCambio;

  get("feeVariable").textContent = cbkDollar ? 4 : 8;
  get("fee").textContent = fee.toFixed(2);
  get("totalUsd").textContent = totalUsd.toFixed(2);
  get("totalCrc").textContent = Math.round(totalCrc).toLocaleString("es-CR");

  results.style.display = "block";
}

function enableProductWeightLabel(id) {
  const peso = document.getElementById(`pound${id}`);

  if (((document.getElementById(`Kg${id}`).checked || document.getElementById(`Lb${id}`).checked) )&& peso.disabled) {
    peso.disabled = false;
	peso.value = 1;
  } 
}

function enableProductWeightLabel2(id) {

  const chk = document.getElementById(`cbkImp${id}`);
  const container = document.getElementById(`impContainer${id}`);

  if (chk.checked) {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }

  calculate(id);
}
