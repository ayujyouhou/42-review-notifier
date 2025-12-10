/**
 * Gmail → Discord 予定通知 Bot (Google Apps Script)
 * 
 * セットアップ:
 * 1. https://script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. DISCORD_WEBHOOK_URL を設定
 * 4. EMAIL_SUBJECT_FILTER を設定
 * 5. DISCORD_USER_ID を設定（メンション用）
 * 6. トリガーを設定（5分おき）
 */

// ===== 設定 =====
const CONFIG = {
  // Discord Webhook URL（チャンネル設定 → 連携サービス → ウェブフック）
  DISCORD_WEBHOOK_URL: 'YOUR_DISCORD_WEBHOOK_URL',
  
  // メンションするユーザーID（開発者モードでIDコピー）
  DISCORD_USER_ID: 'YOUR_USER_ID',
  
  // 検索するメールの件名キーワード
  EMAIL_SUBJECT_FILTER: '予約確認',
  
  // 何分前に通知するか
  REMINDER_MINUTES_BEFORE: 5,
  
  // 検索する過去のメール（時間）
  SEARCH_HOURS: 24,
};

// ===== メイン関数 =====

/**
 * メールをチェックして新着があれば通知（トリガーで定期実行）
 */
function checkEmails() {
  const processedIds = getProcessedEmailIds();
  const emails = searchEmails();
  
  for (const email of emails) {
    const messageId = email.getId();
    
    // 処理済みならスキップ
    if (processedIds.includes(messageId)) {
      continue;
    }
    
    const subject = email.getSubject();
    const body = email.getPlainBody();
    const sender = email.getFrom();
    const date = email.getDate();
    
    // 日時を抽出
    const extractedDateTime = extractDateTime(body);
    
    // 新着メール通知
    sendNewEmailNotification(subject, sender, body, extractedDateTime);
    
    // 5分前リマインダーをスケジュール
    if (extractedDateTime) {
      scheduleReminder(messageId, subject, extractedDateTime);
    }
    
    // 処理済みとして保存
    markAsProcessed(messageId);
  }
}

/**
 * リマインダーを送信（トリガーから呼ばれる）
 */
function sendScheduledReminder(e) {
  const props = PropertiesService.getScriptProperties();
  const remindersJson = props.getProperty('reminders') || '[]';
  const reminders = JSON.parse(remindersJson);
  
  const now = new Date();
  const updatedReminders = [];
  
  for (const reminder of reminders) {
    const reminderTime = new Date(reminder.reminderTime);
    
    // 通知時刻を過ぎていたら送信
    if (now >= reminderTime) {
      sendReminderNotification(reminder.subject, new Date(reminder.eventTime));
    } else {
      updatedReminders.push(reminder);
    }
  }
  
  props.setProperty('reminders', JSON.stringify(updatedReminders));
}

// ===== Gmail 関連 =====

/**
 * 特定の件名を含むメールを検索
 */
function searchEmails() {
  const hours = CONFIG.SEARCH_HOURS;
  const after = new Date(Date.now() - hours * 60 * 60 * 1000);
  const afterStr = Utilities.formatDate(after, 'Asia/Tokyo', 'yyyy/MM/dd');
  
  const query = `subject:${CONFIG.EMAIL_SUBJECT_FILTER} after:${afterStr} is:unread`;
  
  const threads = GmailApp.search(query, 0, 20);
  const emails = [];
  
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      if (message.isUnread()) {
        emails.push(message);
      }
    }
  }
  
  return emails;
}

// ===== 日時抽出 =====

/**
 * メール本文から日時を抽出
 */
function extractDateTime(body) {
  if (!body) return null;
  
  const patterns = [
    // 2024年12月7日 14:30
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/,
    // 2024/12/07 14:30
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/,
    // 12月7日(土) 14:30 or 12月7日 14:30
    /(\d{1,2})月(\d{1,2})日[（(][日月火水木金土][）)]?\s*(\d{1,2}):(\d{2})/,
    /(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = body.match(patterns[i]);
    if (match) {
      try {
        let year, month, day, hour, minute;
        
        if (i <= 1) {
          // 年を含むパターン
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
          hour = parseInt(match[4]);
          minute = parseInt(match[5]);
        } else {
          // 年を含まないパターン（今年と仮定）
          year = new Date().getFullYear();
          month = parseInt(match[1]) - 1;
          day = parseInt(match[2]);
          hour = parseInt(match[3]);
          minute = parseInt(match[4]);
        }
        
        return new Date(year, month, day, hour, minute);
      } catch (e) {
        console.log('日時パースエラー:', e);
        continue;
      }
    }
  }
  
  return null;
}

// ===== Discord 通知 =====

/**
 * 新着メール通知を送信
 */
function sendNewEmailNotification(subject, sender, body, extractedDateTime) {
  const mention = `<@${CONFIG.DISCORD_USER_ID}>`;
  
  const bodyPreview = body.length > 300 ? body.substring(0, 300) + '...' : body;
  
  const embed = {
    title: '📧 新着メールを検知しました',
    color: 0x3498db, // 青
    fields: [
      { name: '件名', value: subject || '(件名なし)', inline: false },
      { name: '送信者', value: sender || '(不明)', inline: false },
    ],
    timestamp: new Date().toISOString(),
  };
  
  if (extractedDateTime) {
    const dateStr = Utilities.formatDate(extractedDateTime, 'Asia/Tokyo', 'yyyy年MM月dd日 HH:mm');
    embed.fields.push({ name: '📅 抽出された予定', value: dateStr, inline: false });
    embed.fields.push({ name: '⏰ リマインダー', value: `${CONFIG.REMINDER_MINUTES_BEFORE}分前に通知します`, inline: false });
  }
  
  if (bodyPreview) {
    embed.fields.push({ name: '本文プレビュー', value: bodyPreview, inline: false });
  }
  
  const payload = {
    content: mention,
    embeds: [embed],
  };
  
  sendDiscordMessage(payload);
}

/**
 * リマインダー通知を送信
 */
function sendReminderNotification(subject, eventTime) {
  const mention = `<@${CONFIG.DISCORD_USER_ID}>`;
  const dateStr = Utilities.formatDate(eventTime, 'Asia/Tokyo', 'yyyy年MM月dd日 HH:mm');
  
  const embed = {
    title: '⏰ 予定の5分前です！',
    color: 0xe74c3c, // 赤
    fields: [
      { name: '件名', value: subject, inline: false },
      { name: '予定時刻', value: dateStr, inline: false },
    ],
    timestamp: new Date().toISOString(),
  };
  
  const payload = {
    content: mention,
    embeds: [embed],
  };
  
  sendDiscordMessage(payload);
}

/**
 * Discord Webhook にメッセージ送信
 */
function sendDiscordMessage(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  
  try {
    const response = UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK_URL, options);
    console.log('Discord送信成功:', response.getResponseCode());
  } catch (e) {
    console.error('Discord送信エラー:', e);
  }
}

// ===== データ保存 =====

/**
 * 処理済みメールIDを取得
 */
function getProcessedEmailIds() {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty('processedEmails') || '[]';
  return JSON.parse(json);
}

/**
 * メールIDを処理済みとして保存
 */
function markAsProcessed(messageId) {
  const props = PropertiesService.getScriptProperties();
  const ids = getProcessedEmailIds();
  
  ids.push(messageId);
  
  // 古いIDを削除（100件まで保持）
  while (ids.length > 100) {
    ids.shift();
  }
  
  props.setProperty('processedEmails', JSON.stringify(ids));
}

/**
 * リマインダーをスケジュール
 */
function scheduleReminder(messageId, subject, eventTime) {
  const props = PropertiesService.getScriptProperties();
  const remindersJson = props.getProperty('reminders') || '[]';
  const reminders = JSON.parse(remindersJson);
  
  const reminderTime = new Date(eventTime.getTime() - CONFIG.REMINDER_MINUTES_BEFORE * 60 * 1000);
  
  // 過去の時刻はスキップ
  if (reminderTime <= new Date()) {
    console.log('通知時刻が過去のためスキップ:', reminderTime);
    return;
  }
  
  reminders.push({
    messageId: messageId,
    subject: subject,
    eventTime: eventTime.toISOString(),
    reminderTime: reminderTime.toISOString(),
  });
  
  props.setProperty('reminders', JSON.stringify(reminders));
  console.log('リマインダーをスケジュール:', reminderTime);
}

// ===== ユーティリティ =====

/**
 * 保存データをクリア（デバッグ用）
 */
function clearAllData() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  console.log('全データをクリアしました');
}

/**
 * 現在のデータを確認（デバッグ用）
 */
function checkData() {
  const props = PropertiesService.getScriptProperties();
  console.log('処理済みメール:', props.getProperty('processedEmails'));
  console.log('リマインダー:', props.getProperty('reminders'));
}

/**
 * テスト通知（セットアップ確認用）
 */
function testNotification() {
  const payload = {
    content: `<@${CONFIG.DISCORD_USER_ID}> テスト通知です！設定が正しく完了しています。`,
    embeds: [{
      title: '✅ セットアップ完了',
      description: 'Gmail → Discord 通知が正しく設定されました。',
      color: 0x2ecc71,
    }],
  };
  
  sendDiscordMessage(payload);
}
