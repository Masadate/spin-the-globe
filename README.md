# Spin the Globe — Booth Quiz App

Offline quiz app for the Sagamine Festival booth (Saturday 17 Oct 2026, 10:00–19:00).
It runs in Safari 15+ or Chrome on a Mac (macOS 12 Monterey or newer). It needs no install and no internet.

## Online version

**https://masadate.github.io/spin-the-globe/**

- Open the link once on Wi-Fi. Wait for **✓ Offline ready** at the bottom right of the title screen. That browser then runs the quiz with no network.
- Phones and tablets work by tapping: Start, a segment, an answer, then Next.
- Players and grand prizes are saved separately per browser and per address. The online copy and the unzipped copy keep separate records, so **use one copy for the whole of Saturday**.

## Set up the Mac

1. Copy `SpinTheGlobe.zip` to the Mac and unzip it on the **Desktop**.
   - Don't run it from Google Drive. Drive streams files on demand, and a missing file means a silent clip.
2. Open `app/index.html` in Safari (right-click › Open With › Safari).
3. Enter full screen with **Control + Command + F**.
4. Open Terminal and run `caffeinate -d` so the screen never sleeps. Leave that window open.
5. Plug in the charger and set the volume.
6. Press **Shift + A** to open the admin panel.
   - Check that "Storage OK" shows.
   - Check that the asset line lists only `lang-mn` as missing.

## Run the booth

| Key | Action |
|---|---|
| Space | Start a new player / go to the next step |
| 1 2 3 4 5 | Segment the physical wheel landed on: National Anthem · Location · Flag · Language · JACKPOT |
| W | Spin the on-screen wheel instead (backup) |
| A B C D | The option the player chose |
| N | Player gave no answer |
| R | Replay the audio clip |
| delete ⌫ | Undo the last answer (on the reveal screen) |
| Esc, Esc | Cancel the current player (nothing is logged) |
| H | Show or hide the key hints |
| Shift + A | Admin panel |

- Each player gets 5 turns. A JACKPOT uses one of them.
- The app grades answers automatically.
- The result screen tells staff what to hand over.
- A second JACKPOT for the same player shows "spin once more". Each player can win one grand prize at most.

### Prize rule

The prize is the higher of the quiz tier and the jackpot tier.

| Result | Prize |
|---|---|
| 0–1 correct | Consolation (drink + candy) |
| 2–3 correct | Bronze |
| 4–5 correct | Silver |
| JACKPOT, stock left | Grand prize |
| JACKPOT, stock gone | Silver ("BIG PRIZE") |

The JACKPOT has a 2% chance per spin, so about 1 player in 10 hits it over 5 turns. The day's pool is 5 grand prizes.

The header shows how many grand prizes are left. Adjust the count in the admin panel if the physical stock differs.

## Before opening and at closing

- **After the Friday dry run:** Shift + A › **Reset all data** (click twice). This clears the rehearsal players and restores 5 grand prizes.
- **At 19:00:** Shift + A › **Export CSV**. The file lands in Downloads. Reconcile with the cash: players × ¥500 = cash − float.
- **Fixing a mistake:** **Undo last player** removes the most recent player and returns a grand prize if one was won.

## Thursday test checklist

- [ ] The physical wheel's JACKPOT wedge is **7.2°** (2%), and the Song wedge now reads **National Anthem**
- [ ] App opens from the Desktop in Safari, full screen
- [ ] National Anthem and Language clips play through the **speaker**
- [ ] Clips play through the **headset**
- [ ] Press **W** until the on-screen wheel lands on National Anthem or Language. The clip must start by itself. If "Press R to play" appears instead, note it and press R.
- [ ] If both should play at once, set up a Multi-Output Device in Audio MIDI Setup
- [ ] Reload the page (Command + R): the grand-prize count and players are kept
- [ ] Export CSV works
- [ ] Time three full 5-turn games, from payment to prize hand-out. Shift + A shows the average play time.
- [ ] Native speakers listen to their language clips (list below) and report any errors

## Changing content

| What | How |
|---|---|
| Replace a language clip with a real voice | Record the sentence on a phone. Save it as MP3 under the same name in `app/assets/audio/language/` (e.g. `fr.mp3`). |
| Add Mongolian | Record the Mongolian sentence and save it as `app/assets/audio/language/mn.mp3`. The app picks it up on reload. |
| Turns, prize tiers, prize names, hand-over text, timer, jackpot odds, stock | Edit `app/js/config.js` in TextEdit, then reload. A changed value replaces any value set earlier in the admin panel. |
| Where each anthem clip starts | Edit `tools/song_starts.json` (seconds per country code), then rerun `python tools/build_data.py`. Every clip plays 15 s, starting at 0 by default. |
| New Japanese text | Rerun `python tools/build_fonts.py <font dir>` on the build PC. Without it, new characters show in the system font. |

### Language clip sentences

Every clip says "Hello! Welcome to our festival. Nice to meet you. Have a wonderful day!" in one language.
The sentences are in `tools/countries.py` (`LANGUAGE_CLIPS`). The voices are Google Translate speech (gTTS). Students can replace any clip with their own recording.

## Rebuilding (only on the build PC)

```
cd tools
python build_flags.py <flag-icons package>
python build_maps.py <ne_50m_admin_0_countries.geojson>
python fetch_anthems.py <download dir>
python make_language_clips.py
python build_data.py
python build_fonts.py <font dir>
python build_site.py
node validate.js
node simulate.js
NODE_PATH=<playwright node_modules> node e2e.js <screenshot dir>
NODE_PATH=<playwright node_modules> node e2e_online.js <local server url> <screenshot dir>
python publish.py "what changed"
```

`publish.py` updates the online version. Rebuild the zip as well if the Mac uses the offline copy.

## Sources

- **Flags:** flag-icons (MIT)
- **Maps:** Natural Earth 1:50m (public domain)
- **Anthems:** US Navy Band recordings via Wikimedia Commons (public domain)
- **Fonts:** Shrikhand, Patua One, Kaisei Decol (SIL Open Font License), matching the Sagamine Festival site

The details are in `app/credits.html`.
