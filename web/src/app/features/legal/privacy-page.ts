import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page prose">
      <h1 class="page-title">Privacidad</h1>
      <p class="muted">Cumplimos la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP). Resumen claro de qué pasa con tus datos:</p>
      <section class="card section">
        <h2>Lo que nunca sale de tu dispositivo</h2>
        <ul>
          <li><strong>Tu CV.</strong> Se lee con pdf.js dentro de tu navegador. Ni el archivo ni su texto se envían a ningún servidor.</li>
          <li><strong>Tu puntaje.</strong> Se calcula en tu navegador sobre el índice público.</li>
          <li><strong>Tu ubicación exacta.</strong> Si pulsas «Usar mi ubicación», el navegador te pide permiso y la ciudad más cercana se calcula aquí con un archivo de ciudades. Las coordenadas no se guardan ni se envían; solo quedan tu país y tu ciudad, en este dispositivo.</li>
          <li><strong>Tu token de GitHub</strong>, si lo usas: queda en memoria de la pestaña y solo viaja a GitHub.</li>
        </ul>
      </section>
      <section class="card section">
        <h2>Lo que guarda la cuenta (opcional)</h2>
        <ul>
          <li>Correo y contraseña cifrada con Argon2id.</li>
          <li>Con tu consentimiento «guardar mi perfil»: identificadores de habilidades (con código ESCO si existe), su origen (demostrada o declarada), años de experiencia, nivel de inglés, tu país y ciudad (nunca coordenadas), las modalidades que buscas y tus preferencias.</li>
          <li>Tus postulaciones, si usas el tablero con sesión iniciada.</li>
          <li>Con tu consentimiento «alertas»: el umbral de puntaje para avisarte por correo.</li>
          <li>Cada consentimiento se registra por finalidad, con la versión del texto y la fecha. Casillas separadas y sin marcar por defecto.</li>
        </ul>
      </section>
      <section class="card section">
        <h2>Tus derechos</h2>
        <p>Desde <a routerLink="/cuenta">Cuenta</a> puedes exportar todo en un archivo (acceso y portabilidad), retirar cada consentimiento y borrar tu cuenta. El borrado es real: no queda ninguna fila tuya en la base de datos.</p>
        <p>El puntaje es una ayuda para ti; nadie más lo ve y no se usa para tomar decisiones sobre ti.</p>
      </section>
      <section class="card section">
        <h2>Datos de terceros</h2>
        <p>De las vacantes guardamos información de la empresa y del puesto. Los correos, teléfonos y enlaces personales de reclutadores se eliminan antes de publicar el índice, y el observatorio solo publica agregados que no permiten identificar a nadie.</p>
      </section>
    </div>
  `,
  styles: `.prose ul { padding-left: 20px; } .prose li { margin-bottom: 6px; }`,
})
export class PrivacyPage {}
