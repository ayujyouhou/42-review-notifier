// 設定ファイル
// このファイルをコピーして config.js として保存し、各項目を設定してください

const CONFIG = {
  // Discord Webhook URL（チャンネル設定 → 連携サービス → ウェブフック）
  DISCORD_WEBHOOK_URL: 'YOUR_DISCORD_WEBHOOK_URL',
  
  // メンションするユーザーID（開発者モードでIDコピー）
  DISCORD_USER_ID: 'YOUR_USER_ID',
  
  // 検索するメールの件名キーワード
  EMAIL_SUBJECT_FILTER: 'You have a new booking',
  
  // 何分前に通知するか（10分前）
  REMINDER_MINUTES_BEFORE: 10,
  
  // 検索する過去のメール（時間）
  SEARCH_HOURS: 24,
};
