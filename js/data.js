/*
 * Mustard Seed: game content.
 * Scripture quotations are from the King James Version (public domain).
 */
(function (root) {
  'use strict';

  // Works produce Faith on their own. Costs grow 15% with each one owned.
  // Each has five upgrades, unlocked at 1, 5, 25, 50 and 100 owned.
  const GENERATORS = [
    {
      id: 'shepherd', name: 'Shepherd', plural: 'Shepherds', baseCost: 15, baseRate: 0.1,
      blurb: 'Keeps watch over the flock by night.',
      verse: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1',
      upgrades: [
        ['Rod and Staff', 'Psalm 23:4'],
        ['Green Pastures', 'Psalm 23:2'],
        ['Still Waters', 'Psalm 23:2'],
        ['The Ninety and Nine', 'Luke 15:4'],
        ['The Good Shepherd', 'John 10:11'],
      ],
    },
    {
      id: 'fisherman', name: 'Fisherman', plural: 'Fishermen', baseCost: 100, baseRate: 1,
      blurb: 'Leaves the nets behind to follow.',
      verse: 'Follow me, and I will make you fishers of men.', ref: 'Matthew 4:19',
      upgrades: [
        ['Mended Nets', 'Matthew 4:21'],
        ['Launch into the Deep', 'Luke 5:4'],
        ['Cast on the Right Side', 'John 21:6'],
        ['Nets Ready to Break', 'Luke 5:6'],
        ['An Hundred and Fifty and Three', 'John 21:11'],
      ],
    },
    {
      id: 'sower', name: 'Sower', plural: 'Sowers', baseCost: 1100, baseRate: 8,
      blurb: 'Scatters the word on good ground.',
      verse: 'For whatsoever a man soweth, that shall he also reap.', ref: 'Galatians 6:7',
      upgrades: [
        ['Good Ground', 'Matthew 13:8'],
        ['Thirtyfold', 'Mark 4:20'],
        ['Sixtyfold', 'Mark 4:20'],
        ['An Hundredfold', 'Mark 4:20'],
        ['Fields White unto Harvest', 'John 4:35'],
      ],
    },
    {
      id: 'scribe', name: 'Scribe', plural: 'Scribes', baseCost: 12000, baseRate: 47,
      blurb: 'Copies the word, line upon line.',
      verse: 'Write the vision, and make it plain upon tables, that he may run that readeth it.', ref: 'Habakkuk 2:2',
      upgrades: [
        ['Ink and Pen', '3 John 1:13'],
        ['Tables of Stone', 'Exodus 24:12'],
        ['Line upon Line', 'Isaiah 28:10'],
        ['Jot and Tittle', 'Matthew 5:18'],
        ['Written in Their Hearts', 'Jeremiah 31:33'],
      ],
    },
    {
      id: 'psalmist', name: 'Psalmist', plural: 'Psalmists', baseCost: 130000, baseRate: 260,
      blurb: 'Sings praise on harp and psaltery.',
      verse: 'Let every thing that hath breath praise the LORD.', ref: 'Psalm 150:6',
      upgrades: [
        ['Ten Strings', 'Psalm 33:2'],
        ['A New Song', 'Psalm 96:1'],
        ['Timbrel and Dance', 'Psalm 150:4'],
        ['Loud Cymbals', 'Psalm 150:5'],
        ['A Joyful Noise', 'Psalm 100:1'],
      ],
    },
    {
      id: 'prophet', name: 'Prophet', plural: 'Prophets', baseCost: 1.4e6, baseRate: 1400,
      blurb: 'Cries out in the wilderness.',
      verse: 'Here am I; send me.', ref: 'Isaiah 6:8',
      upgrades: [
        ['A Live Coal', 'Isaiah 6:6'],
        ['Voice in the Wilderness', 'Isaiah 40:3'],
        ['Mantle of Elijah', '2 Kings 2:13'],
        ['A Double Portion', '2 Kings 2:9'],
        ['Chariot of Fire', '2 Kings 2:11'],
      ],
    },
    {
      id: 'apostle', name: 'Apostle', plural: 'Apostles', baseCost: 2e7, baseRate: 7800,
      blurb: 'Carries the gospel to every nation.',
      verse: 'Go ye into all the world, and preach the gospel to every creature.', ref: 'Mark 16:15',
      upgrades: [
        ['Staff and Sandals', 'Mark 6:8'],
        ['Shake Off the Dust', 'Matthew 10:14'],
        ['Road to Damascus', 'Acts 9:3'],
        ['Letters to the Churches', 'Revelation 1:11'],
        ['Uttermost Part of the Earth', 'Acts 1:8'],
      ],
    },
    {
      id: 'temple', name: 'Temple', plural: 'Temples', baseCost: 3.3e8, baseRate: 44000,
      blurb: 'A house of cedar, overlaid with gold.',
      verse: 'So Solomon built the house, and finished it.', ref: '1 Kings 6:14',
      upgrades: [
        ['Cedars of Lebanon', '1 Kings 5:6'],
        ['Overlaid with Gold', '1 Kings 6:22'],
        ['Jachin and Boaz', '1 Kings 7:21'],
        ['The Most Holy Place', '1 Kings 6:16'],
        ['An House of Prayer for All People', 'Isaiah 56:7'],
      ],
    },
    {
      id: 'bush', name: 'Burning Bush', plural: 'Burning Bushes', baseCost: 5.1e9, baseRate: 260000,
      blurb: 'Burns with fire, yet is not consumed.',
      verse: 'The bush burned with fire, and the bush was not consumed.', ref: 'Exodus 3:2',
      upgrades: [
        ['Holy Ground', 'Exodus 3:5'],
        ['I AM THAT I AM', 'Exodus 3:14'],
        ['The Rod of God', 'Exodus 4:20'],
        ['Signs and Wonders', 'Exodus 7:3'],
        ['The Unconsumed Flame', 'Exodus 3:2'],
      ],
    },
    {
      id: 'pillar', name: 'Pillar of Fire', plural: 'Pillars of Fire', baseCost: 7.5e10, baseRate: 1.6e6,
      blurb: 'Leads the way by day and by night.',
      verse: 'By night in a pillar of fire, to give them light; to go by day and night.', ref: 'Exodus 13:21',
      upgrades: [
        ['Cloud by Day', 'Exodus 13:21'],
        ['The Sea Divided', 'Exodus 14:21'],
        ['Water out of the Rock', 'Exodus 17:6'],
        ['Forty Years in the Wilderness', 'Deuteronomy 8:2'],
        ['A Land Flowing with Milk and Honey', 'Exodus 3:8'],
      ],
    },
    {
      id: 'host', name: 'Heavenly Host', plural: 'Heavenly Hosts', baseCost: 1e12, baseRate: 1e7,
      blurb: 'A multitude of angels, praising God.',
      verse: 'Glory to God in the highest, and on earth peace, good will toward men.', ref: 'Luke 2:14',
      upgrades: [
        ["Jacob's Ladder", 'Genesis 28:12'],
        ['Six Wings', 'Isaiah 6:2'],
        ['Holy, Holy, Holy', 'Isaiah 6:3'],
        ['Ten Thousand Times Ten Thousand', 'Revelation 5:11'],
        ['The Last Trump', '1 Corinthians 15:52'],
      ],
    },
    {
      id: 'jerusalem', name: 'New Jerusalem', plural: 'New Jerusalems', baseCost: 1.4e13, baseRate: 6.5e7,
      blurb: 'The holy city, coming down out of heaven.',
      verse: 'And I John saw the holy city, new Jerusalem, coming down from God out of heaven.', ref: 'Revelation 21:2',
      upgrades: [
        ['Gates of Pearl', 'Revelation 21:21'],
        ['Streets of Pure Gold', 'Revelation 21:21'],
        ['A Pure River of Water of Life', 'Revelation 22:1'],
        ['The Tree of Life', 'Revelation 22:2'],
        ['No Need of the Sun', 'Revelation 21:23'],
      ],
    },
  ];

  // Prayer upgrades unlock after a number of prayers (taps), counted across all Jubilees.
  // `mult` multiplies the base prayer; `fpsShare` adds a share of Faith per second to each prayer.
  const PRAYER_UPGRADES = [
    { id: 'bread', name: 'Daily Bread', ref: 'Matthew 6:11', cost: 100, clicks: 10, mult: 2 },
    { id: 'fervent', name: 'Fervent Prayer', ref: 'James 5:16', cost: 1000, clicks: 75, mult: 2 },
    { id: 'ask', name: 'Ask, Seek, Knock', ref: 'Matthew 7:7', cost: 20000, clicks: 250, mult: 2 },
    { id: 'mustard', name: 'Faith as a Grain of Mustard Seed', ref: 'Matthew 17:20', cost: 2e5, clicks: 500, fpsShare: 0.01 },
    { id: 'ceasing', name: 'Pray Without Ceasing', ref: '1 Thessalonians 5:17', cost: 2e7, clicks: 1000, fpsShare: 0.01 },
    { id: 'gathered', name: 'Two or Three Gathered', ref: 'Matthew 18:20', cost: 2e9, clicks: 2000, fpsShare: 0.01 },
    { id: 'lords', name: "The Lord's Prayer", ref: 'Matthew 6:9', cost: 2e11, clicks: 3500, fpsShare: 0.01 },
    { id: 'wrestle', name: 'Wrestling until the Breaking of the Day', ref: 'Genesis 32:24', cost: 2e13, clicks: 5000, fpsShare: 0.01 },
  ];

  // Multiply all Faith. Each appears once a third of its cost has been gathered this Jubilee.
  const GLOBAL_UPGRADES = [
    { id: 'commandments', name: 'The Ten Commandments', ref: 'Exodus 20:1', cost: 25000, mult: 1.1 },
    { id: 'fruit', name: 'Fruit of the Spirit', ref: 'Galatians 5:22', cost: 2.5e6, mult: 1.15 },
    { id: 'armour', name: 'The Whole Armour of God', ref: 'Ephesians 6:11', cost: 2.5e8, mult: 1.2 },
    { id: 'seventy', name: 'Seventy Times Seven', ref: 'Matthew 18:22', cost: 2.5e10, mult: 1.25 },
    { id: 'commission', name: 'The Great Commission', ref: 'Matthew 28:19', cost: 2.5e12, mult: 1.5 },
    { id: 'candlesticks', name: 'Seven Golden Candlesticks', ref: 'Revelation 1:12', cost: 2.5e14, mult: 2 },
    { id: 'booklife', name: 'The Book of Life', ref: 'Revelation 20:12', cost: 2.5e16, mult: 2 },
  ];

  // One-off upgrades for rest and manna.
  const SPECIAL_UPGRADES = [
    {
      id: 'sabbath', name: 'Remember the Sabbath', ref: 'Exodus 20:8', cost: 50000,
      unlock: { type: 'runFaith', n: 10000 },
      effect: 'Faith gathered while you are away rises from 50% to 100%.',
    },
    {
      id: 'quail', name: 'Quails at Even', ref: 'Exodus 16:13', cost: 77777,
      unlock: { type: 'manna', n: 3 },
      effect: 'Manna falls 30% more often.',
    },
    {
      id: 'baskets', name: 'Twelve Baskets Full', ref: 'Matthew 14:20', cost: 7777777,
      unlock: { type: 'manna', n: 10 },
      effect: 'Blessings from manna last twice as long.',
    },
    {
      id: 'sixthday', name: 'Twice as Much on the Sixth Day', ref: 'Exodus 16:22', cost: 777777777,
      unlock: { type: 'manna', n: 20 },
      effect: 'Gathered manna gives twice as much Faith.',
    },
  ];

  // What a fallen manna can bring. Weights are relative.
  const MANNA_EFFECTS = [
    {
      id: 'manna', weight: 55, name: 'Manna from Heaven',
      verse: 'Behold, I will rain bread from heaven for you.', ref: 'Exodus 16:4',
    },
    {
      id: 'loaves', weight: 35, name: 'Loaves and Fishes', mult: 7, duration: 77,
      verse: 'And they did all eat, and were filled.', ref: 'Matthew 14:20',
    },
    {
      id: 'fire', weight: 10, name: 'Tongues of Fire', mult: 77, duration: 13,
      verse: 'There appeared unto them cloven tongues like as of fire.', ref: 'Acts 2:3',
    },
  ];

  const JUBILEE_VERSE = {
    verse: 'And ye shall hallow the fiftieth year, and proclaim liberty throughout all the land unto all the inhabitants thereof: it shall be a jubile unto you.',
    ref: 'Leviticus 25:10',
  };

  const WORKS_VERSE = {
    verse: 'For as the body without the spirit is dead, so faith without works is dead also.',
    ref: 'James 2:26',
  };

  // The 66 books, in canonical order. Each one read adds to all Faith, forever.
  const BOOKS = [
    ['Genesis', 'In the beginning God created the heaven and the earth.', 'Genesis 1:1'],
    ['Exodus', 'The LORD shall fight for you, and ye shall hold your peace.', 'Exodus 14:14'],
    ['Leviticus', 'Thou shalt love thy neighbour as thyself: I am the LORD.', 'Leviticus 19:18'],
    ['Numbers', 'The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee.', 'Numbers 6:24–25'],
    ['Deuteronomy', 'And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might.', 'Deuteronomy 6:5'],
    ['Joshua', 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Joshua 1:9'],
    ['Judges', 'The LORD is with thee, thou mighty man of valour.', 'Judges 6:12'],
    ['Ruth', 'Whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God.', 'Ruth 1:16'],
    ['1 Samuel', 'For man looketh on the outward appearance, but the LORD looketh on the heart.', '1 Samuel 16:7'],
    ['2 Samuel', 'The LORD is my rock, and my fortress, and my deliverer.', '2 Samuel 22:2'],
    ['1 Kings', 'And after the fire a still small voice.', '1 Kings 19:12'],
    ['2 Kings', 'Fear not: for they that be with us are more than they that be with them.', '2 Kings 6:16'],
    ['1 Chronicles', 'O give thanks unto the LORD; for he is good; for his mercy endureth for ever.', '1 Chronicles 16:34'],
    ['2 Chronicles', 'If my people, which are called by my name, shall humble themselves, and pray, and seek my face, and turn from their wicked ways; then will I hear from heaven, and will forgive their sin, and will heal their land.', '2 Chronicles 7:14'],
    ['Ezra', 'For Ezra had prepared his heart to seek the law of the LORD, and to do it, and to teach in Israel statutes and judgments.', 'Ezra 7:10'],
    ['Nehemiah', 'For the joy of the LORD is your strength.', 'Nehemiah 8:10'],
    ['Esther', 'And who knoweth whether thou art come to the kingdom for such a time as this?', 'Esther 4:14'],
    ['Job', 'For I know that my redeemer liveth, and that he shall stand at the latter day upon the earth.', 'Job 19:25'],
    ['Psalms', 'Thy word is a lamp unto my feet, and a light unto my path.', 'Psalm 119:105'],
    ['Proverbs', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5'],
    ['Ecclesiastes', 'To every thing there is a season, and a time to every purpose under the heaven.', 'Ecclesiastes 3:1'],
    ['Song of Solomon', 'Many waters cannot quench love, neither can the floods drown it.', 'Song of Solomon 8:7'],
    ['Isaiah', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', 'Isaiah 40:31'],
    ['Jeremiah', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', 'Jeremiah 29:11'],
    ['Lamentations', "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", 'Lamentations 3:22–23'],
    ['Ezekiel', 'A new heart also will I give you, and a new spirit will I put within you.', 'Ezekiel 36:26'],
    ['Daniel', "My God hath sent his angel, and hath shut the lions' mouths.", 'Daniel 6:22'],
    ['Hosea', 'For I desired mercy, and not sacrifice; and the knowledge of God more than burnt offerings.', 'Hosea 6:6'],
    ['Joel', 'And it shall come to pass afterward, that I will pour out my spirit upon all flesh.', 'Joel 2:28'],
    ['Amos', 'But let judgment run down as waters, and righteousness as a mighty stream.', 'Amos 5:24'],
    ['Obadiah', 'As thou hast done, it shall be done unto thee.', 'Obadiah 1:15'],
    ['Jonah', 'Salvation is of the LORD.', 'Jonah 2:9'],
    ['Micah', 'And what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?', 'Micah 6:8'],
    ['Nahum', 'The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him.', 'Nahum 1:7'],
    ['Habakkuk', 'The just shall live by his faith.', 'Habakkuk 2:4'],
    ['Zephaniah', 'The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy.', 'Zephaniah 3:17'],
    ['Haggai', 'The glory of this latter house shall be greater than of the former, saith the LORD of hosts.', 'Haggai 2:9'],
    ['Zechariah', 'Not by might, nor by power, but by my spirit, saith the LORD of hosts.', 'Zechariah 4:6'],
    ['Malachi', 'Prove me now herewith, saith the LORD of hosts, if I will not open you the windows of heaven, and pour you out a blessing, that there shall not be room enough to receive it.', 'Malachi 3:10'],
    ['Matthew', 'Ye are the light of the world. A city that is set on an hill cannot be hid.', 'Matthew 5:14'],
    ['Mark', 'With men it is impossible, but not with God: for with God all things are possible.', 'Mark 10:27'],
    ['Luke', 'For with God nothing shall be impossible.', 'Luke 1:37'],
    ['John', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 'John 3:16'],
    ['Acts', 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me.', 'Acts 1:8'],
    ['Romans', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', 'Romans 8:28'],
    ['1 Corinthians', 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.', '1 Corinthians 13:13'],
    ['2 Corinthians', 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', '2 Corinthians 5:17'],
    ['Galatians', 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.', 'Galatians 6:9'],
    ['Ephesians', 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God.', 'Ephesians 2:8'],
    ['Philippians', 'I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'],
    ['Colossians', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.', 'Colossians 3:23'],
    ['1 Thessalonians', 'Rejoice evermore. Pray without ceasing. In every thing give thanks.', '1 Thessalonians 5:16–18'],
    ['2 Thessalonians', 'But ye, brethren, be not weary in well doing.', '2 Thessalonians 3:13'],
    ['1 Timothy', 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.', '1 Timothy 4:12'],
    ['2 Timothy', 'I have fought a good fight, I have finished my course, I have kept the faith.', '2 Timothy 4:7'],
    ['Titus', 'For the grace of God that bringeth salvation hath appeared to all men.', 'Titus 2:11'],
    ['Philemon', 'I thank my God, making mention of thee always in my prayers.', 'Philemon 1:4'],
    ['Hebrews', 'Now faith is the substance of things hoped for, the evidence of things not seen.', 'Hebrews 11:1'],
    ['James', 'Even so faith, if it hath not works, is dead, being alone.', 'James 2:17'],
    ['1 Peter', 'Casting all your care upon him; for he careth for you.', '1 Peter 5:7'],
    ['2 Peter', 'One day is with the Lord as a thousand years, and a thousand years as one day.', '2 Peter 3:8'],
    ['1 John', 'He that loveth not knoweth not God; for God is love.', '1 John 4:8'],
    ['2 John', 'And this is love, that we walk after his commandments.', '2 John 1:6'],
    ['3 John', 'I have no greater joy than to hear that my children walk in truth.', '3 John 1:4'],
    ['Jude', 'Mercy unto you, and peace, and love, be multiplied.', 'Jude 1:2'],
    ['Revelation', 'I am Alpha and Omega, the beginning and the end, the first and the last.', 'Revelation 22:13'],
  ].map(function (b, i) {
    return { index: i, name: b[0], verse: b[1], ref: b[2], testament: i < 39 ? 'old' : 'new' };
  });

  const DATA = {
    GENERATORS, PRAYER_UPGRADES, GLOBAL_UPGRADES, SPECIAL_UPGRADES,
    MANNA_EFFECTS, JUBILEE_VERSE, WORKS_VERSE, BOOKS,
  };

  if (typeof module === 'object' && module.exports) module.exports = DATA;
  else root.MustardSeedData = DATA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
