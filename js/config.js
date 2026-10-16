// Booth settings. Safe to edit in any text editor; reload the page afterwards.
// Values changed in the admin panel (Shift+A) override these and persist
// until the value here changes.

window.CONFIG = {
  price: 500,
  turnsPerPlayer: 5,

  // Grand prizes available for the whole day ("while supplies last").
  grandPrizeStock: 5,

  // Jackpot chance for the on-screen spin. The physical wheel needs a 7.2° wedge (2%).
  // A jackpot ends the game, whatever turns are left.
  jackpotOdds: 0.02,

  // Correct answers needed for each quiz tier. Fewer than bronze gets the consolation prize.
  minCorrect: { bronze: 2, silver: 4, gold: 5 },

  // Visible countdown per question. It never fails the player automatically.
  timerSeconds: 30,

  // Seconds of inactivity before the result screen returns to the title screen.
  resultIdleSeconds: 45,

  // Name and color of each prize tier. Staff choose the actual prize.
  prizes: {
    consolation: { en: "Thanks for playing!", ja: "参加賞", color: "#8fa3bf" },
    bronze: { en: "BRONZE", ja: "銅賞", color: "#d08a4a" },
    silver: { en: "SILVER", ja: "銀賞", color: "#cfd8e3" },
    gold: { en: "GOLD", ja: "金賞", color: "#e6b422" },
    grand: { en: "GRAND PRIZE", ja: "特賞", color: "#ffc93c" },
  },

  segments: {
    song: { key: "1", icon: "🎵", en: "National Anthem", ja: "国歌", color: "#a855f7", prompt: "Whose national anthem is this?", promptJa: "どこの国の国歌？" },
    map: { key: "2", icon: "🗺️", en: "Location", ja: "地図", color: "#10b981", prompt: "Which country is highlighted?", promptJa: "この国はどこ？" },
    flag: { key: "3", icon: "🚩", en: "Flag", ja: "国旗", color: "#ef4444", prompt: "Whose flag is this?", promptJa: "どこの国の国旗？" },
    lang: { key: "4", icon: "🗣️", en: "Language", ja: "言語", color: "#3b82f6", prompt: "Where would you hear this language?", promptJa: "どこの国の言葉？" },
    jackpot: { key: "5", icon: "🎰", en: "JACKPOT", ja: "大当たり", color: "#f59e0b" },
  },
};
