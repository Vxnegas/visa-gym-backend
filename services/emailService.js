const nodemailer = require('nodemailer');
const db = require('../database/db');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Envía un correo real y registra el resultado en logs_de_envio.
 * Solo marca la notificación como "enviado" si el proveedor confirma la entrega.
 */
async function enviarCorreoNotificacion(notificacion, destinatarioEmail) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE notificaciones SET estado = 'procesando' WHERE id = $1`,
      [notificacion.id]
    );

    let resultadoProveedor = null;
    let exito = false;
    let errorMensaje = null;

    try {
      const info = await getTransporter().sendMail({
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to: destinatarioEmail,
        subject: notificacion.asunto,
        text: notificacion.mensaje,
        html: `<div style="font-family:sans-serif;white-space:pre-wrap">${notificacion.mensaje}</div>`,
      });
      resultadoProveedor = JSON.stringify(info.response || info.messageId || info);
      exito = true;
    } catch (sendErr) {
      errorMensaje = sendErr.message;
      resultadoProveedor = sendErr.message;
      exito = false;
    }

    await client.query(
      `INSERT INTO logs_de_envio (notificacion_id, destinatario, proveedor, estado, respuesta_proveedor)
       VALUES ($1, $2, 'smtp', $3, $4)`,
      [notificacion.id, destinatarioEmail, exito ? 'exitoso' : 'fallido', resultadoProveedor]
    );

    if (exito) {
      await client.query(
        `UPDATE notificaciones
         SET estado = 'enviado', fecha_envio = now(), error_mensaje = NULL
         WHERE id = $1`,
        [notificacion.id]
      );
    } else {
      await client.query(
        `UPDATE notificaciones
         SET estado = 'error', error_mensaje = $2
         WHERE id = $1`,
        [notificacion.id, errorMensaje]
      );
    }

    await client.query('COMMIT');
    return exito;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { enviarCorreoNotificacion, getTransporter };
