# Mustard Seed

A Bible idle game for the browser.

> The kingdom of heaven is like to a grain of mustard seed … which indeed is the least of all seeds: but when it is grown, it is the greatest among herbs, and becometh a tree, so that the birds of the air come and lodge in the branches thereof. (Matthew 13:31–32)

## How to play

- **Pray.** Tap the tree to gather Faith.
- **Works.** Spend Faith on works that gather it for you: Shepherds, Fishermen, Sowers, Scribes, Psalmists, Prophets, Apostles, Temples, the Burning Bush, the Pillar of Fire, the Heavenly Host and New Jerusalem. Each costs 15% more than the last.
- **Upgrades.** Each work has five upgrades that double it, unlocked at 1, 5, 25, 50 and 100 owned. There are also prayer upgrades, upgrades that raise all Faith, and upgrades for rest and manna.
- **Scripture.** As your all-time Faith doubles, you read the next book of the Bible, from Genesis to Revelation, with a verse from each. Every book adds 2% to all Faith for good, and the tree grows with them.
- **Manna.** Now and then manna falls. Tap it for Faith, *Loaves and Fishes* (all Faith ×7 for 77 seconds) or *Tongues of Fire* (prayers ×77 for 13 seconds).
- **Jubilee.** When progress slows, proclaim a Jubilee (Leviticus 25). Your Faith, works and their upgrades are released, and you receive Blessings worth +2% each, forever. Books, Blessings, and the Sabbath and manna upgrades are kept.
- **Rest.** While you are away, your works keep gathering at half strength, up to a day. *Remember the Sabbath* brings them to full strength.

The game saves to your browser every few seconds. Use **Records → Copy save code** to move a game to another device.

## Running it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

It also works as-is on GitHub Pages.

## Code

| File | What it holds |
| --- | --- |
| `js/data.js` | All content: works, upgrades, manna, the 66 books and their verses |
| `js/engine.js` | Game rules as pure functions over a plain state object (no DOM) |
| `js/ui.js` | The page: rendering, input, the animated tree, saving, time away |
| `css/style.css` | Styles |
| `tests/engine.test.js` | Rule tests |

Run the tests with Node 18 or newer:

```sh
npm test
```

### Balance

Tuning numbers live at the top of `js/engine.js`:

- Each book needs twice the all-time Faith of the one before (Exodus at 100).
- Blessings are the cube root of all-time Faith divided by one million.

With these, a bot that plays greedily and proclaims a Jubilee whenever it would double its Blessings reads 20 books in under an hour, finishes the Old Testament in about a day, and reaches Revelation in about six days.

## Credits

Scripture quotations are from the King James Version, which is in the public domain. Fonts are Alegreya, Alegreya Sans and Uncial Antiqua from Google Fonts.
