import { useState, type ReactNode } from 'react';
import type { Dossier } from '../shared/dossier.ts';

// Las URLs vienen de contenido web: solo se enlazan las http(s).
const urlSegura = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="tarjeta seccion">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  const esUrl = urlSegura(valor) !== null;
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{esUrl ? <a href={valor} target="_blank" rel="noreferrer">{valor}</a> : valor}</dd>
    </div>
  );
}

function Vacio({ lista, texto }: { lista: unknown[]; texto: string }) {
  return lista.length === 0 ? <p className="tenue">{texto}</p> : null;
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      className="secundario pequeno"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? '¡Copiado!' : etiqueta}
    </button>
  );
}

// Los dossieres guardados antes de añadir estos campos no los traen.
const pendientesDe = (d: Dossier) => ({
  quienDecide: d.quienDecide ?? null,
  datos: d.datosPendientes ?? [],
  documentos: d.documentosAPedir ?? [],
});

function resumenTexto(d: Dossier): string {
  const v = d.ventas;
  const { quienDecide } = pendientesDe(d);
  return [
    `${d.empresa.razonSocial}${d.empresa.cif ? ` (${d.empresa.cif})` : ''}`,
    '',
    d.resumenEjecutivo,
    ...(quienDecide ? ['', `Quién decide (${quienDecide.certeza}): ${quienDecide.persona}`] : []),
    '',
    'Señales:',
    ...d.senales.map((s) => `${s.tipo === 'oportunidad' ? '▲' : s.tipo === 'riesgo' ? '▼' : '●'} ${s.descripcion}`),
    '',
    'Ganchos de apertura:',
    ...v.ganchosApertura.map((g) => `- ${g}`),
    '',
    'Preguntas clave:',
    ...v.preguntasDescubrimiento.map((p) => `- ${p}`),
    '',
    `Siguiente paso a pedir: ${v.siguientePaso}`,
  ].join('\n');
}

const NAV: Array<[string, string]> = [
  ['resumen', 'Resumen'],
  ['estrategia', 'Estrategia'],
  ['empresa', 'Empresa'],
  ['personas', 'Personas'],
  ['finanzas', 'Finanzas'],
  ['registro', 'BORME'],
  ['noticias', 'Noticias'],
  ['pendientes', 'Pendientes'],
  ['fuentes', 'Fuentes'],
];

export function DossierView({ dossier: d }: { dossier: Dossier }) {
  const e = d.empresa;
  const v = d.ventas;
  const pendientes = pendientesDe(d);

  return (
    <article className="dossier">
      <div className="titulo-dossier">
        <div>
          <h1>{e.razonSocial}</h1>
          <p className="tenue">
            {[e.nombreComercial, e.cif, e.formaJuridica, e.provincia].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="acciones no-print">
          <BotonCopiar texto={resumenTexto(d)} etiqueta="Copiar chuleta" />
          <button className="secundario pequeno" onClick={() => window.print()}>
            Imprimir / PDF
          </button>
        </div>
      </div>

      <nav className="indice no-print">
        {NAV.map(([id, nombre]) => (
          <a key={id} href={`#${id}`}>
            {nombre}
          </a>
        ))}
      </nav>

      <Seccion id="resumen" titulo="Resumen ejecutivo">
        <div className="etiquetas">
          <span className={`etiqueta estado-${e.estado === 'activa' ? 'ok' : 'aviso'}`}>{e.estado}</span>
          <span className={`etiqueta confianza-${d.confianza.nivel}`}>Confianza {d.confianza.nivel}</span>
        </div>
        <p>{d.resumenEjecutivo}</p>
        {pendientes.quienDecide && (
          <p className="destacado">
            <strong>Quién decide</strong> ({pendientes.quienDecide.certeza}): {pendientes.quienDecide.persona}
            <br />
            <span className="tenue">Para confirmarlo: «{pendientes.quienDecide.preguntaParaConfirmar}»</span>
          </p>
        )}
        {d.senales.length > 0 && (
          <ul className="senales">
            {d.senales.map((s, i) => (
              <li key={i} className={`senal-${s.tipo}`}>
                <strong>{s.tipo === 'oportunidad' ? '▲ Oportunidad' : s.tipo === 'riesgo' ? '▼ Riesgo' : '● Dato'}</strong> {s.descripcion}
              </li>
            ))}
          </ul>
        )}
        <p className="tenue pequeno">{d.confianza.notas}</p>
      </Seccion>

      <Seccion id="estrategia" titulo="Estrategia para cerrar la reunión">
        <h3>Propuesta de valor</h3>
        <p className="destacado">{v.propuestaDeValor}</p>

        <div className="dos-columnas">
          <div>
            <h3>Cómo abrir la conversación</h3>
            <ul>{v.ganchosApertura.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
          <div>
            <h3>Preguntas de descubrimiento</h3>
            <ol>{v.preguntasDescubrimiento.map((p, i) => <li key={i}>{p}</li>)}</ol>
          </div>
        </div>

        <h3>Puntos de dolor probables</h3>
        <table>
          <thead>
            <tr><th>Necesidad</th><th>Por qué lo pensamos</th></tr>
          </thead>
          <tbody>
            {v.puntosDeDolor.map((p, i) => (
              <tr key={i}><td>{p.dolor}</td><td>{p.evidencia}</td></tr>
            ))}
          </tbody>
        </table>

        <h3>Objeciones y respuestas</h3>
        <dl className="objeciones">
          {v.objeciones.map((o, i) => (
            <div key={i}>
              <dt>«{o.objecion}»</dt>
              <dd>{o.respuesta}</dd>
            </div>
          ))}
        </dl>

        <div className="dos-columnas">
          <div>
            <h3>Cómo cerrar</h3>
            <p>{v.estrategiaCierre}</p>
          </div>
          <div>
            <h3>Siguiente paso a pedir</h3>
            <p className="destacado">{v.siguientePaso}</p>
          </div>
        </div>

        <div className="email">
          <div className="email-cabecera">
            <h3>Email de seguimiento</h3>
            <BotonCopiar texto={`Asunto: ${v.emailSeguimiento.asunto}\n\n${v.emailSeguimiento.cuerpo}`} etiqueta="Copiar email" />
          </div>
          <p><strong>Asunto:</strong> {v.emailSeguimiento.asunto}</p>
          <pre>{v.emailSeguimiento.cuerpo}</pre>
        </div>
      </Seccion>

      <Seccion id="empresa" titulo="Ficha de la empresa">
        <dl className="ficha">
          <Dato etiqueta="Razón social" valor={e.razonSocial} />
          <Dato etiqueta="CIF" valor={e.cif} />
          <Dato etiqueta="Forma jurídica" valor={e.formaJuridica} />
          <Dato etiqueta="Constitución" valor={e.fechaConstitucion} />
          <Dato etiqueta="Domicilio social" valor={e.domicilioSocial} />
          <Dato etiqueta="CNAE" valor={e.cnae} />
          <Dato etiqueta="Actividad" valor={e.actividad} />
          <Dato etiqueta="Capital social" valor={e.capitalSocial} />
          <Dato etiqueta="Web" valor={e.web} />
          <Dato etiqueta="Teléfono" valor={e.telefono} />
          <Dato etiqueta="Email" valor={e.email} />
          <Dato etiqueta="LinkedIn" valor={d.presenciaDigital.linkedin} />
        </dl>
        {e.objetoSocial && (
          <>
            <h3>Objeto social</h3>
            <p>{e.objetoSocial}</p>
          </>
        )}
        <h3>Estructura societaria</h3>
        {d.estructuraSocietaria.grupoEmpresarial && <p>Grupo: {d.estructuraSocietaria.grupoEmpresarial}</p>}
        <Vacio lista={d.estructuraSocietaria.socios} texto="No se han encontrado socios publicados." />
        <ul>
          {d.estructuraSocietaria.socios.map((s, i) => (
            <li key={i}>
              <strong>{s.nombre}</strong>
              {s.participacion && ` — ${s.participacion}`}
              {s.notas && <span className="tenue"> · {s.notas}</span>}
            </li>
          ))}
        </ul>
        {d.estructuraSocietaria.sociedadesVinculadas.length > 0 && (
          <p>Sociedades vinculadas: {d.estructuraSocietaria.sociedadesVinculadas.join(', ')}</p>
        )}
        {d.competidores.length > 0 && (
          <>
            <h3>Competidores</h3>
            <p>{d.competidores.join(' · ')}</p>
          </>
        )}
        {d.presenciaDigital.reputacion && (
          <>
            <h3>Presencia digital y reputación</h3>
            <p>{d.presenciaDigital.reputacion}</p>
            {d.presenciaDigital.redesSociales.length > 0 && <p className="tenue">{d.presenciaDigital.redesSociales.join(' · ')}</p>}
          </>
        )}
      </Seccion>

      <Seccion id="personas" titulo="Personas clave">
        <Vacio lista={d.personasClave} texto="No se han encontrado cargos publicados." />
        <div className="personas">
          {d.personasClave.map((p, i) => (
            <div key={i} className="persona">
              <strong>{p.nombre}</strong>
              <span>{p.cargo}</span>
              {p.notas && <p className="tenue pequeno">{p.notas}</p>}
              {urlSegura(p.perfilUrl) && (
                <a href={urlSegura(p.perfilUrl)!} target="_blank" rel="noreferrer" className="pequeno">
                  Ver perfil
                </a>
              )}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion id="finanzas" titulo="Datos financieros">
        <Vacio lista={d.datosFinancieros} texto="No se han encontrado cuentas publicadas." />
        {d.datosFinancieros.length > 0 && (
          <table>
            <thead>
              <tr><th>Ejercicio</th><th>Ventas</th><th>Resultado</th><th>Empleados</th><th>Fuente</th></tr>
            </thead>
            <tbody>
              {d.datosFinancieros.map((f, i) => (
                <tr key={i}>
                  <td>{f.ejercicio}</td>
                  <td>{f.ventas ?? '—'}</td>
                  <td>{f.resultado ?? '—'}</td>
                  <td>{f.empleados ?? '—'}</td>
                  <td className="tenue">{f.fuente ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>{d.lecturaFinanciera}</p>
      </Seccion>

      <Seccion id="registro" titulo="Actos inscritos (BORME)">
        <Vacio lista={d.actosRegistrales} texto="No se han encontrado actos publicados." />
        <ul className="cronologia">
          {d.actosRegistrales.map((a, i) => (
            <li key={i}>
              <span className="fecha">{a.fecha}</span>
              <strong>{a.acto}</strong>
              {a.detalle && <span className="tenue"> — {a.detalle}</span>}
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion id="noticias" titulo="Noticias y actualidad">
        <Vacio lista={d.noticias} texto="No se han encontrado noticias recientes." />
        <ul className="noticias">
          {d.noticias.map((n, i) => (
            <li key={i}>
              <span className="fecha">{n.fecha ?? ''}</span>
              {urlSegura(n.url) ? (
                <a href={urlSegura(n.url)!} target="_blank" rel="noreferrer"><strong>{n.titular}</strong></a>
              ) : (
                <strong>{n.titular}</strong>
              )}
              <p>{n.resumen}</p>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion id="pendientes" titulo="Pendientes de confirmar">
        <Vacio lista={pendientes.datos} texto="No quedan datos importantes por localizar." />
        {pendientes.datos.length > 0 && (
          <table>
            <thead>
              <tr><th>Dato</th><th>Dónde se buscó</th><th>Cómo conseguirlo</th></tr>
            </thead>
            <tbody>
              {pendientes.datos.map((p, i) => (
                <tr key={i}><td>{p.dato}</td><td className="tenue">{p.dondeSeBusco}</td><td>{p.comoConseguirlo}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {pendientes.documentos.length > 0 && (
          <>
            <h3>Documentos a pedir al cliente</h3>
            <ul>{pendientes.documentos.map((doc, i) => <li key={i}>{doc}</li>)}</ul>
          </>
        )}
      </Seccion>

      <Seccion id="fuentes" titulo="Fuentes">
        <ol className="fuentes">
          {d.fuentes.map((f, i) => (
            <li key={i}>
              {urlSegura(f.url) ? (
                <a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a>
              ) : (
                f.titulo
              )}
            </li>
          ))}
        </ol>
        <p className="tenue pequeno">
          Información obtenida de fuentes públicas y procesada con IA. Verifica los datos críticos antes de usarlos.
        </p>
      </Seccion>
    </article>
  );
}
