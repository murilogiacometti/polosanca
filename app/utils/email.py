import html
import logging
from collections.abc import Mapping
from string import Template

from flask import Flask, current_app
from flask_mail import Mail, Message

logger = logging.getLogger(__name__)

mail = Mail()

_INVITATION_HTML_TEMPLATE = Template(
    """<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .button:hover { background: #5568d3; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Polo Sanca!</h1>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            <p>You've been invited to join the Polo Sanca refrigeration monitoring platform.</p>
            <p>Click the button below to accept your invitation and set up your account:</p>
            <p style="text-align: center;">
                <a href="${invitation_url}" class="button">Accept Invitation</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px;">${invitation_url}</p>
            <p>This invitation will expire in 7 days.</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
        <div class="footer">
            <p>&copy; 2025 Polo Sanca. All rights reserved.</p>
        </div>
    </div>
</body>
</html>"""
)

_PASSWORD_RESET_HTML_TEMPLATE = Template(
    """<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Reset Your Polo Sanca Password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Use the link below within 1 hour:</p>
        <p><a href="${reset_url}">${reset_url}</a></p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
    </div>
</body>
</html>"""
)

_ALERT_HTML_TEMPLATE = Template(
    """<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>[${severity}] Refrigeration Alert — ${serial}</h2>
        <p><strong>Branch:</strong> ${branch_name}</p>
        <p><strong>Type:</strong> ${rule_type}</p>
        <p><strong>Message:</strong> ${message_text}</p>
        <p><strong>Triggered At (UTC):</strong> ${created_at}</p>
        <p><a href="${dashboard_url}">Open Equipment in Polo Sanca</a></p>
    </div>
</body>
</html>"""
)


def _render_escaped_html(template: Template, **values: object) -> str:
    """Render an HTML email template with strict HTML entity escaping for every variable."""
    escaped = {key: html.escape(str(val), quote=True) for key, val in values.items()}
    return template.safe_substitute(escaped)


def init_mail(app: Flask) -> None:
    """Initialize Flask-Mail with app"""
    mail.init_app(app)


def send_invitation_email(email: str, name: str, invitation_token: str) -> bool:
    """Send invitation email to new user."""
    try:
        if not current_app.config.get("MAIL_SERVER"):
            logger.warning("Email not configured; invitation email suppressed for %s.", email)
            return True

        invitation_url = (
            f"{current_app.config.get('FRONTEND_URL', 'http://localhost:5173')}/accept-invitation"
            f"?token={invitation_token}"
        )

        html_body = _render_escaped_html(
            _INVITATION_HTML_TEMPLATE,
            name=name,
            invitation_url=invitation_url,
        )

        text_body = f"""
        Welcome to Polo Sanca!

        Hi {name},

        You've been invited to join the Polo Sanca refrigeration monitoring platform.

        Click the link below to accept your invitation and set up your account:
        {invitation_url}

        This invitation will expire in 7 days.

        If you didn't expect this invitation, you can safely ignore this email.

        © 2025 Polo Sanca. All rights reserved.
        """

        msg = Message(
            subject="You're invited to Polo Sanca",
            sender=current_app.config.get("MAIL_DEFAULT_SENDER", "noreply@polosanca.com"),
            recipients=[email],
        )
        msg.body = text_body
        msg.html = html_body

        mail.send(msg)
        logger.info("Invitation email sent successfully to %s", email)
        return True

    except Exception as e:
        logger.error("Failed to send invitation email to %s: %s", email, e)
        return False


def send_password_reset_email(email: str, name: str, reset_token: str) -> bool:
    """Send 1-hour password reset email to an active user."""
    try:
        if not current_app.config.get("MAIL_SERVER"):
            logger.warning("Email not configured; password reset email suppressed for %s.", email)
            return True

        reset_url = (
            f"{current_app.config.get('FRONTEND_URL', 'http://localhost:5173')}/reset-password?token={reset_token}"
        )

        html_body = _render_escaped_html(
            _PASSWORD_RESET_HTML_TEMPLATE,
            name=name,
            reset_url=reset_url,
        )

        text_body = (
            f"Hi {name},\n\n"
            f"Reset your Polo Sanca password within 1 hour using the link below:\n"
            f"{reset_url}\n\n"
            "If you did not request a password reset, you can safely ignore this email.\n"
        )

        msg = Message(
            subject="Reset your Polo Sanca password",
            sender=current_app.config.get("MAIL_DEFAULT_SENDER", "noreply@polosanca.com"),
            recipients=[email],
        )
        msg.body = text_body
        msg.html = html_body

        mail.send(msg)
        logger.info("Password reset email sent successfully to %s", email)
        return True
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", email, e)
        return False


def send_alert_notification_email(
    recipients: list[str],
    alert_data: Mapping[str, object],
    raise_on_error: bool = False,
) -> bool:
    """Send alert notification email to active Company Admins and permitted Company Viewers."""
    if not recipients:
        return False

    serial = alert_data.get("serial", "Unknown")
    branch_name = alert_data.get("branch_name", "Unknown Branch")
    severity = str(alert_data.get("severity", "warning")).upper()
    rule_type = alert_data.get("rule_type", "alert")
    message_text = alert_data.get("message", "")
    created_at = alert_data.get("created_at", "")
    equipment_id = alert_data.get("equipment_id", "")

    dashboard_url = f"{current_app.config.get('FRONTEND_URL', 'http://localhost:5173')}/equipments/{equipment_id}"

    try:
        if not current_app.config.get("MAIL_SERVER"):
            logger.info(
                "[Alert Email Simulated] [%s] %s (%s) -> %d recipient(s)",
                severity,
                serial,
                branch_name,
                len(recipients),
            )
            return True

        subject = f"[{severity}] Polo Sanca Alert — {serial} ({branch_name})"
        text_body = (
            f"Polo Sanca Alert Notification\n\n"
            f"Severity: {severity}\n"
            f"Equipment: {serial}\n"
            f"Branch: {branch_name}\n"
            f"Type: {rule_type}\n"
            f"Details: {message_text}\n"
            f"Triggered At (UTC): {created_at}\n\n"
            f"Inspect equipment: {dashboard_url}\n"
        )
        html_body = _render_escaped_html(
            _ALERT_HTML_TEMPLATE,
            severity=severity,
            serial=serial,
            branch_name=branch_name,
            rule_type=rule_type,
            message_text=message_text,
            created_at=created_at,
            dashboard_url=dashboard_url,
        )

        msg = Message(
            subject=subject,
            sender=current_app.config.get("MAIL_DEFAULT_SENDER", "noreply@polosanca.com"),
            recipients=recipients,
        )
        msg.body = text_body
        msg.html = html_body

        mail.send(msg)
        logger.info("Alert notification email sent for %s to %d recipient(s)", serial, len(recipients))
        return True
    except Exception as exc:
        logger.error("Failed to send alert notification email for %s: %s", serial, exc)
        if raise_on_error:
            raise
        return False
