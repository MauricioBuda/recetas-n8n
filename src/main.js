import "./style.css";
import { jsPDF } from "jspdf";


// ============================================================
// CONFIGURACIÓN
// ============================================================

// Mientras desarrollamos usamos la URL de prueba.
// Cuando pasemos a producción, reemplazaremos esta URL por
// la Production URL del Webhook de n8n.

const WEBHOOK_URL =
  "https://mbuda.app.n8n.cloud/webhook/8e9cc553-9255-4f75-b154-4f78deba25f5";


// ============================================================
// ELEMENTOS DEL DOM
// ============================================================

const formulario = document.getElementById("formularioRecetas");
const btnGenerar = document.getElementById("btnGenerar");
const btnGenerarPDF = document.getElementById("btnGenerarPDF");

const estadoCarga = document.getElementById("estadoCarga");
const resultado = document.getElementById("resultado");
const listaRecetas = document.getElementById("listaRecetas");

const overlayCarga = document.getElementById("overlayCarga");
const textoCarga = overlayCarga.querySelector("p");


// Guardamos las recetas actuales para utilizarlas
// posteriormente al generar el PDF.
let recetasActuales = [];


// ============================================================
// FUNCIÓN AUXILIAR: ESCAPAR HTML
// ============================================================

// Evita que contenido recibido desde el backend pueda
// interpretarse como HTML.

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================
// FUNCIÓN AUXILIAR: MOSTRAR ERROR
// ============================================================

function mostrarError(mensaje) {
  resultado.hidden = true;
  estadoCarga.hidden = true;

  alert(mensaje);
}


// ============================================================
// FUNCIÓN AUXILIAR: CAMBIAR ESTADO DE CARGA
// ============================================================

function mostrarCarga() {
  overlayCarga.hidden = false;

  btnGenerar.disabled = true;

  textoCarga.textContent = "Pensando cosas ricas";

  setTimeout(() => {
    if (!overlayCarga.hidden) {
      textoCarga.textContent = "Vayan poniendo la mesa";
    }
  }, 6000);

  setTimeout(() => {
    if (!overlayCarga.hidden) {
      textoCarga.textContent = "Ya se siente el olorcito";
    }
  }, 12000);

    setTimeout(() => {
    if (!overlayCarga.hidden) {
      textoCarga.textContent = "¡Ya casi! Lo bueno se hace esperar";
    }
  }, 18000);
}

function ocultarCarga() {
  overlayCarga.hidden = true;

  btnGenerar.disabled = false;
  btnGenerar.textContent = "Generar mis recetas";
}

// ============================================================
// FUNCIÓN: OBTENER DATOS DEL FORMULARIO
// ============================================================

function obtenerDatosFormulario() {
  const personas = Number(
    document.getElementById("personas").value
  );

  const condicion =
    document.getElementById("condicion").value.trim();

  const evitar =
    document.getElementById("evitar").value.trim();

  const stock =
    document.getElementById("stock").value.trim();

  const usarStock =
    document.getElementById("usarStock").value.trim();

  const observaciones =
    document.getElementById("observaciones").value.trim();


  return {
    personas,
    condicion,
    evitar,
    stock,
    observaciones,
    usarStock
  };
}


// ============================================================
// FUNCIÓN: VALIDAR DATOS DEL FORMULARIO
// ============================================================

function validarDatos(datos) {
  if (
    !Number.isInteger(datos.personas) ||
    datos.personas < 1 ||
    datos.personas > 6
  ) {
    throw new Error(
      "La cantidad de personas seleccionada no es válida."
    );
  }
}


// ============================================================
// FUNCIÓN: NORMALIZAR RESPUESTA DEL WEBHOOK
// ============================================================

function extraerDatosRespuesta(respuesta) {

  // Caso esperado:
  // {
  //   productos_ignorados: [],
  //   menu: [...]
  // }

  if (
    respuesta &&
    typeof respuesta === "object" &&
    !Array.isArray(respuesta) &&
    Array.isArray(respuesta.menu)
  ) {
    return respuesta;
  }


  // Algunos formatos de respuesta pueden envolver
  // el resultado dentro de un array.

  if (
    Array.isArray(respuesta) &&
    respuesta.length > 0 &&
    respuesta[0] &&
    typeof respuesta[0] === "object"
  ) {

    if (Array.isArray(respuesta[0].menu)) {
      return respuesta[0];
    }

    if (
      respuesta[0].json &&
      Array.isArray(respuesta[0].json.menu)
    ) {
      return respuesta[0].json;
    }
  }


  // Otro caso posible: respuesta.json

  if (
    respuesta &&
    respuesta.json &&
    typeof respuesta.json === "object" &&
    Array.isArray(respuesta.json.menu)
  ) {
    return respuesta.json;
  }


  throw new Error(
    "La respuesta recibida desde n8n no tiene el formato esperado."
  );
}


// ============================================================
// FUNCIÓN: VALIDAR RESPUESTA DE N8N
// ============================================================

function validarRespuesta(datos) {

  if (!datos || typeof datos !== "object") {
    throw new Error(
      "La respuesta del servidor no es válida."
    );
  }


  if (!Array.isArray(datos.menu)) {
    throw new Error(
      'La respuesta no contiene un array "menu" válido.'
    );
  }


  if (datos.menu.length !== 3) {
    throw new Error(
      `Se recibieron ${datos.menu.length} recetas. Se esperaban exactamente 3.`
    );
  }


  for (let i = 0; i < datos.menu.length; i++) {

    const receta = datos.menu[i];

    if (!receta || typeof receta !== "object") {
      throw new Error(
        `La opción ${i + 1} no tiene un formato válido.`
      );
    }


    if (!Array.isArray(receta.ingredientes)) {
      throw new Error(
        `La opción ${i + 1} no contiene ingredientes válidos.`
      );
    }


    if (!Array.isArray(receta.preparacion)) {
      throw new Error(
        `La opción ${i + 1} no contiene una preparación válida.`
      );
    }
  }


  return true;
}


// ============================================================
// FUNCIÓN: RENDERIZAR INGREDIENTES
// ============================================================

function renderizarIngredientes(ingredientes) {

  return ingredientes
    .map((ingrediente) => {

      const nombre =
        escaparHTML(ingrediente.nombre);

      const cantidad =
        escaparHTML(ingrediente.cantidad);

      const unidad =
        escaparHTML(ingrediente.unidad);

      let textoCantidad = "";

      if (cantidad === "a gusto") {
        textoCantidad = "a gusto";
      } else {
        textoCantidad =
          `${cantidad} ${unidad}`.trim();
      }

      return `
        <li>
          <strong>${nombre}</strong>
          <span>${textoCantidad}</span>
        </li>
      `;
    })
    .join("");
}


// ============================================================
// FUNCIÓN: RENDERIZAR PREPARACIÓN
// ============================================================

function renderizarPreparacion(preparacion) {

  return preparacion
    .map((paso, indice) => {

      const numero =
        Number.isInteger(Number(paso.paso))
          ? Number(paso.paso)
          : indice + 1;

      const descripcion =
        escaparHTML(paso.descripcion);

      const tiempo =
        Number.isFinite(Number(paso.tiempo_minutos))
          ? Number(paso.tiempo_minutos)
          : 0;

      return `
        <li class="paso-receta">

          <span class="numero-paso">
            ${numero}
          </span>

          <div class="contenido-paso">
            ${descripcion}

            <span class="tiempo-paso">
              ${tiempo} min
            </span>
          </div>

        </li>
      `;
    })
    .join("");
}


// ============================================================
// FUNCIÓN: RENDERIZAR RECETA
// ============================================================

function renderizarReceta(receta, indice) {

  const nombre =
    escaparHTML(receta.nombre);

  const tiempoTotal =
    Number.isFinite(Number(receta.tiempo_total_minutos))
      ? Number(receta.tiempo_total_minutos)
      : 0;

  return `
    <article class="tarjeta-receta">

      <div class="encabezado-receta">

        <span class="opcion-receta">
          Opción ${indice + 1}
        </span>

        <h3 class="nombre-receta">
          ${nombre}
        </h3>

        <div class="info-receta">

          <span>
            ${tiempoTotal} minutos
          </span>

        </div>

      </div>


      <div class="seccion-receta">

        <h3>
          Ingredientes
        </h3>

        <ul class="lista-ingredientes">
          ${renderizarIngredientes(
            receta.ingredientes
          )}
        </ul>

      </div>


      <div class="seccion-receta">

        <h3>
          Preparación
        </h3>

        <ol class="lista-preparacion">
          ${renderizarPreparacion(
            receta.preparacion
          )}
        </ol>

      </div>

    </article>
  `;
}


// ============================================================
// FUNCIÓN: MOSTRAR RECETAS
// ============================================================

function mostrarRecetas(datos) {

  recetasActuales = datos.menu;

  listaRecetas.innerHTML =
    recetasActuales
      .map((receta, indice) =>
        renderizarReceta(receta, indice)
      )
      .join("");

  resultado.hidden = false;

const primeraReceta =
  listaRecetas.querySelector(".tarjeta-receta");

if (primeraReceta) {
  primeraReceta.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
}


// ============================================================
// EVENTO: ENVIAR FORMULARIO
// ============================================================

formulario.addEventListener("submit", async (evento) => {

  evento.preventDefault();


  try {

    // --------------------------------------------------------
    // 1. OBTENER DATOS
    // --------------------------------------------------------

    const datosFormulario =
      obtenerDatosFormulario();


    // --------------------------------------------------------
    // 2. VALIDAR DATOS
    // --------------------------------------------------------

    validarDatos(datosFormulario);


    // --------------------------------------------------------
    // 3. MOSTRAR CARGA
    // --------------------------------------------------------

    mostrarCarga();


    // --------------------------------------------------------
    // 4. ENVIAR DATOS A N8N
    // --------------------------------------------------------

    const respuesta = await fetch(
      WEBHOOK_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(
          datosFormulario
        )
      }
    );


    // --------------------------------------------------------
    // 5. COMPROBAR RESPUESTA HTTP
    // --------------------------------------------------------

    if (!respuesta.ok) {

      throw new Error(
        `El servidor respondió con el código ${respuesta.status}.`
      );
    }


    // --------------------------------------------------------
    // 6. LEER RESPUESTA
    // --------------------------------------------------------

    const textoRespuesta =
      await respuesta.text();


    if (!textoRespuesta.trim()) {
      throw new Error(
        "n8n no devolvió ninguna respuesta."
      );
    }


    let respuestaJSON;

    try {

      respuestaJSON =
        JSON.parse(textoRespuesta);

    } catch (error) {

      throw new Error(
        "n8n devolvió una respuesta que no es JSON válido."
      );
    }


    // --------------------------------------------------------
    // 7. EXTRAER DATOS
    // --------------------------------------------------------

    const datos =
      extraerDatosRespuesta(
        respuestaJSON
      );


    // --------------------------------------------------------
    // 8. VALIDAR
    // --------------------------------------------------------

    validarRespuesta(datos);


    // --------------------------------------------------------
    // 9. MOSTRAR RECETAS
    // --------------------------------------------------------

    mostrarRecetas(datos);


  } catch (error) {

    console.error(
      "Error al generar recetas:",
      error
    );

    mostrarError(
      error.message ||
      "Ocurrió un error al generar las recetas."
    );

  } finally {

    ocultarCarga();
  }
});


// ============================================================
// FUNCIÓN: AGREGAR TEXTO AL PDF
// ============================================================

// ============================================================
// FUNCIONES AUXILIARES PARA EL PDF
// ============================================================

const PDF = {
  marron: [139, 94, 60],
  marronOscuro: [86, 59, 43],
  beige: [247, 243, 238],
  beigeClaro: [250, 248, 245],
  borde: [221, 212, 204],
  gris: [116, 107, 101],
  blanco: [255, 255, 255],
  negro: [47, 41, 37]
};


// ============================================================
// AGREGAR TEXTO CON SALTO DE LÍNEA
// ============================================================

function agregarTextoPDF(
  doc,
  texto,
  x,
  y,
  ancho,
  alturaLinea = 5,
  tamaño = 10,
  maxY = 275
) {
  doc.setFontSize(tamaño);

  const lineas = doc.splitTextToSize(
    String(texto ?? ""),
    ancho
  );

  for (const linea of lineas) {

    if (y > maxY) {
      doc.addPage();
      y = 20;
    }

    doc.text(linea, x, y);

    y += alturaLinea;
  }

  return y;
}


// ============================================================
// ENCABEZADO DE PÁGINA
// ============================================================

function dibujarEncabezadoPDF(doc, titulo = "¿Qué comemos?") {

  const anchoPagina =
    doc.internal.pageSize.getWidth();

  // Fondo superior
  doc.setFillColor(...PDF.beige);
  doc.rect(
    0,
    0,
    anchoPagina,
    38,
    "F"
  );

  // Línea decorativa inferior
  doc.setFillColor(...PDF.marron);
  doc.rect(
    0,
    36,
    anchoPagina,
    2,
    "F"
  );

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...PDF.marron);

  doc.text(
    titulo,
    anchoPagina / 2,
    19,
    { align: "center" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF.gris);

  doc.text(
    "Tres opciones de recetas según tus preferencias",
    anchoPagina / 2,
    28,
    { align: "center" }
  );
}


// ============================================================
// PIE DE PÁGINA
// ============================================================

function dibujarPiePDF(doc, numeroPagina) {

  const anchoPagina =
    doc.internal.pageSize.getWidth();

  const altoPagina =
    doc.internal.pageSize.getHeight();

  doc.setDrawColor(...PDF.borde);
  doc.setLineWidth(0.3);

  doc.line(
    18,
    altoPagina - 17,
    anchoPagina - 18,
    altoPagina - 17
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF.gris);

  doc.text(
    "¿Qué comemos?",
    18,
    altoPagina - 10
  );

  doc.text(
    `Página ${numeroPagina}`,
    anchoPagina - 18,
    altoPagina - 10,
    { align: "right" }
  );
}


// ============================================================
// COMPROBAR ESPACIO
// ============================================================

function comprobarEspacioPDF(
  doc,
  y,
  espacioNecesario,
  margenInferior = 24
) {

  const altoPagina =
    doc.internal.pageSize.getHeight();

if (
  y + espacioNecesario >
  altoPagina - margenInferior
) {
  doc.addPage();

  return 20;
}

  return y;
}


// ============================================================
// GENERAR PDF
// ============================================================

function generarPDF() {

  if (recetasActuales.length !== 3) {

    alert(
      "Primero tenés que generar las 3 recetas."
    );

    return;
  }


  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });


  const anchoPagina =
    doc.internal.pageSize.getWidth();

  const altoPagina =
    doc.internal.pageSize.getHeight();

  const margen = 18;

  const anchoContenido =
    anchoPagina - margen * 2;


  // ==========================================================
  // PRIMERA PÁGINA
  // ==========================================================

  doc.setFillColor(...PDF.beige);
  doc.rect(
    0,
    0,
    anchoPagina,
    altoPagina,
    "F"
  );

  // dibujarEncabezadoPDF(doc);

  let y = 20;


  // Pequeña introducción

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF.gris);

  y = agregarTextoPDF(
    doc,
    "Elegí entre estas tres alternativas preparadas según los datos que ingresaste.",
    margen,
    y,
    anchoContenido,
    5,
    10,
    270
  );

  y += 8;


  // ==========================================================
  // RECETAS
  // ==========================================================

  recetasActuales.forEach(
    (receta, indiceReceta) => {

      // Cada opción comienza en una página nueva,
      // excepto la primera.

      if (indiceReceta > 0) {

        doc.addPage();

        doc.setFillColor(...PDF.beige);
        doc.rect(
          0,
          0,
          anchoPagina,
          altoPagina,
          "F"
        );

        // dibujarEncabezadoPDF(doc);

        y = 20;
      }


      // ========================================================
      // TARJETA PRINCIPAL
      // ========================================================

      const altoTarjetaInicial = 48;

      y = comprobarEspacioPDF(
        doc,
        y,
        altoTarjetaInicial
      );


      doc.setFillColor(...PDF.blanco);
      doc.setDrawColor(...PDF.borde);
      doc.setLineWidth(0.3);

      doc.roundedRect(
        margen,
        y,
        anchoContenido,
        45,
        5,
        5,
        "FD"
      );


      // ========================================================
      // ETIQUETA OPCIÓN
      // ========================================================

      doc.setFillColor(...PDF.marron);
      doc.roundedRect(
        margen + 7,
        y + 7,
        27,
        8,
        4,
        4,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...PDF.blanco);

      doc.text(
        `OPCIÓN ${indiceReceta + 1}`,
        margen + 20.5,
        y + 12.3,
        { align: "center" }
      );


      // ========================================================
      // NOMBRE
      // ========================================================

      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(...PDF.marronOscuro);

      const nombreLineas =
        doc.splitTextToSize(
          receta.nombre,
          anchoContenido - 55
        );

      doc.text(
        nombreLineas,
        margen + 7,
        y + 25
      );


      // ========================================================
      // TIEMPO
      // ========================================================

      const textoTiempo =
        `${receta.tiempo_total_minutos} min`;

      doc.setFillColor(...PDF.beige);
      doc.roundedRect(
        anchoPagina - margen - 34,
        y + 7,
        27,
        8,
        4,
        4,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...PDF.marron);

      doc.text(
        textoTiempo,
        anchoPagina - margen - 20.5,
        y + 12.3,
        { align: "center" }
      );


      y += 56;


      // ========================================================
      // INGREDIENTES
      // ========================================================

      y = comprobarEspacioPDF(
        doc,
        y,
        20
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...PDF.marronOscuro);

      doc.text(
        "Ingredientes",
        margen,
        y
      );

      y += 7;


      receta.ingredientes.forEach(
        (ingrediente) => {

          const cantidad =
            ingrediente.cantidad === "a gusto"
              ? "a gusto"
              : `${ingrediente.cantidad} ${ingrediente.unidad}`.trim();

          const textoIngrediente =
            `${ingrediente.nombre} — ${cantidad}`;

          const lineas =
            doc.splitTextToSize(
              textoIngrediente,
              anchoContenido - 12
            );

          const altoFila =
            Math.max(
              9,
              lineas.length * 4.5 + 4
            );


          y = comprobarEspacioPDF(
            doc,
            y,
            altoFila
          );


          // Fondo de cada ingrediente

          doc.setFillColor(...PDF.beigeClaro);
          doc.setDrawColor(...PDF.borde);

          doc.roundedRect(
            margen,
            y,
            anchoContenido,
            altoFila - 1,
            3,
            3,
            "FD"
          );


          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...PDF.negro);

          doc.text(
            lineas,
            margen + 4,
            y + 5
          );

          y += altoFila + 2;
        }
      );


      y += 5;


      // ========================================================
      // PREPARACIÓN
      // ========================================================

      y = comprobarEspacioPDF(
        doc,
        y,
        20
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...PDF.marronOscuro);

      doc.text(
        "Preparación",
        margen,
        y
      );

      y += 9;


      receta.preparacion.forEach(
        (paso, indicePaso) => {

          const numero =
            Number.isInteger(
              Number(paso.paso)
            )
              ? Number(paso.paso)
              : indicePaso + 1;


          const descripcion =
            String(
              paso.descripcion ?? ""
            );


          const tiempo =
            Number.isFinite(
              Number(paso.tiempo_minutos)
            )
              ? Number(paso.tiempo_minutos)
              : 0;


          const texto =
            descripcion;


          const lineas =
            doc.splitTextToSize(
              texto,
              anchoContenido - 17
            );


          const altoPaso =
            Math.max(
              13,
              lineas.length * 4.8 + 7
            );


          y = comprobarEspacioPDF(
            doc,
            y,
            altoPaso
          );


          // ==================================================
          // CÍRCULO DEL PASO
          // ==================================================

          doc.setFillColor(...PDF.marron);

          doc.circle(
            margen + 5,
            y + 4,
            4.5,
            "F"
          );


          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...PDF.blanco);

          doc.text(
            String(numero),
            margen + 5,
            y + 6,
            { align: "center" }
          );


          // ==================================================
          // TEXTO DEL PASO
          // ==================================================

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...PDF.negro);

          doc.text(
            lineas,
            margen + 14,
            y + 4
          );


          // ==================================================
          // TIEMPO DEL PASO
          // ==================================================

          const yTiempo =
            y +
            4 +
            lineas.length * 4.8 +
            1;

          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...PDF.gris);

          doc.text(
            `${tiempo} min`,
            margen + 14,
            yTiempo
          );


          y =
            yTiempo + 7;
        }
      );
    }
  );


  // ==========================================================
  // PIE DE PÁGINA EN TODAS LAS PÁGINAS
  // ==========================================================

  const totalPaginas =
    doc.internal.getNumberOfPages();

  for (
    let pagina = 1;
    pagina <= totalPaginas;
    pagina++
  ) {

    doc.setPage(pagina);

    dibujarPiePDF(
      doc,
      pagina
    );
  }


  // ==========================================================
  // DESCARGA
  // ==========================================================

  doc.save(
    "mis-3-recetas.pdf"
  );
}


// ============================================================
// EVENTO: GENERAR PDF
// ============================================================

btnGenerarPDF.addEventListener(
  "click",
  generarPDF
);