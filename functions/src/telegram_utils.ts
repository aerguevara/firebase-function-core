/**
 * Adventure Streak: Telegram Utilities for Fraud Guard
 */

export interface FraudLogEntry {
  userId: string;
  activityId: string;
  reason: string;
  severity: string;
  timestamp: string;
}

/**
 * Sends a daily summary of fraud detections to the admin via Telegram.
 * 
 * @param databaseId - The Firestore database ID (undefined for default PRO, or "adventure-streak-pre").
 * @param logs - The list of fraud logs collected in the last 24h.
 */
export async function sendDailyFraudSummary(databaseId: string | undefined, logs: FraudLogEntry[]): Promise<boolean> {
  const isPre = databaseId === "adventure-streak-pre";
  const envPrefix = isPre ? "PRE" : "PRO";
  
  const header = `🛡️ *Informe Diario: Fraud Guard (${envPrefix})*`;
  const footer = `\n\n_Generado automáticamente a las 18:00h_`;
  
  let body = "";
  if (logs.length === 0) {
    body = "\n✅ Todo despejado. No se detectaron fraudes en las últimas 24 horas.";
  } else {
    body = `\n🚨 Se detectaron *${logs.length}* actividades fraudulentas:\n`;
    const limitedLogs = logs.slice(0, 15); 
    
    limitedLogs.forEach(log => {
      body += `\n- *User:* \`${log.userId}\` 
  *Razón:* ${log.reason}
  *ID:* \`${log.activityId}\``;
    });

    if (logs.length > 15) {
      body += `\n\n... y ${logs.length - 15} casos más.`;
    }
  }

  const fullText = header + body + footer;
  return sendTelegramMessage(fullText, envPrefix);
}

/**
 * Sends a raw message to Telegram bot using environment-specific credentials.
 * Supports multiple recipients if chat ID is a comma-separated list.
 */
export async function sendTelegramMessage(text: string, envPrefix: "PRE" | "PRO" = "PRO"): Promise<boolean> {
  const token = process.env[`TELEGRAM_BOT_TOKEN_${envPrefix}`];
  const chatIdsRaw = process.env[`TELEGRAM_CHAT_ID_${envPrefix}`];

  if (!token || !chatIdsRaw) {
    console.error(`[Telegram] Telegram credentials missing for ${envPrefix}. 
      Ensure TELEGRAM_BOT_TOKEN_${envPrefix} and TELEGRAM_CHAT_ID_${envPrefix} are set.`);
    return false;
  }

  const chatIds = chatIdsRaw.split(",").map(id => id.trim()).filter(id => id.length > 0);
  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const results = await Promise.all(chatIds.map(async (chatId) => {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "Markdown"
        })
      });
      
      if (!response.ok) {
        const err = await response.json();
        console.error(`[Telegram] Error sending to ${chatId}:`, err);
      }
      return response.ok;
    }));
    return results.some(res => res); // Return true if at least one succeeded
  } catch (error) {
    console.error(`[Telegram] Error sending message for ${envPrefix}:`, error);
    return false;
  }
}
