// Booth settings. Safe to edit in any text editor; reload the page afterwards.
// Values changed in the admin panel (Shift+A) override these and persist.

window.CONFIG = {
  price: 500,
  turnsPerPlayer: 2,

  // Grand prizes available for the whole day ("while supplies last").
  grandPrizeStock: 8,

  // Jackpot chance for the on-screen spin. The physical wheel uses an 18° wedge (5%).
  jackpotOdds: 0.05,

  // Visible countdown per question. It never fails the player automatically.
  timerSeconds: 30,

  // Seconds of inactivity before the result screen returns to the title screen.
  resultIdleSeconds: 45,

  // What staff hand over at each tier. Every player also gets a drink.
  prizes: {
    consolation: { en: "Thanks for playing!", ja: "参加賞", give: "Drink + 1 candy", color: "#8fa3bf" },
    bronze: { en: "BRONZE", ja: "銅賞", give: "Drink + candy + small snack or sticker", color: "#d08a4a" },
    silver: { en: "SILVER", ja: "銀賞", give: "Drink + candy + larger snack or character good", color: "#cfd8e3" },
    grand: { en: "GRAND PRIZE", ja: "特賞", give: "Drink + international snack gift box", color: "#ffc93c" },
  },

  segments: {
    song: { key: "1", icon: "🎵", en: "Song", ja: "国歌", color: "#a855f7", prompt: "Whose national anthem is this?", promptJa: "どこの国の国歌？" },
    map: { key: "2", icon: "🗺️", en: "Location", ja: "地図", color: "#10b981", prompt: "Which country is highlighted?", promptJa: "この国はどこ？" },
    flag: { key: "3", icon: "🚩", en: "Flag", ja: "国旗", color: "#ef4444", prompt: "Whose flag is this?", promptJa: "どこの国の国旗？" },
    lang: { key: "4", icon: "🗣️", en: "Language", ja: "言語", color: "#3b82f6", prompt: "Where would you hear this language?", promptJa: "どこの国の言葉？" },
    jackpot: { key: "5", icon: "🎰", en: "JACKPOT", ja: "大当たり", color: "#f59e0b" },
  },
};
