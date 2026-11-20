(() => {
  const stopWords = new Set((
    'a an and are as at be by for from in into is it of on or that the their this to toward towards with ' +
    'il lo la i gli le un uno una e ed di da del dello della dei degli delle in su per tra fra al allo alla ai agli alle ' +
    'come che con nel nello nella nei negli nelle sul sullo sulla sui sugli sulle un una uno'
  ).split(/\s+/));
  const titleNoise = new Set((
    'new recent introduction introductory guide handbook manual volume vol edition revised report working paper ' +
    'model study studies analysis essays selected collected toward reader book'
  ).split(/\s+/));

  function titleCase(value) {
    return value.split(' ').map(word => word ? word[0].toLocaleUpperCase() + word.slice(1) : word).join(' ');
  }

  function suggestTopics(titles) {
    const scores = new Map();
    for (const title of (Array.isArray(titles) ? titles : []).slice(0, 200)) {
      const words = String(title).slice(0, 300).normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
      const segments = [];
      let segment = [];
      const flush = () => { if (segment.length) segments.push(segment); segment = []; };
      for (const rawWord of words) {
        const word = rawWord.toLocaleLowerCase();
        if (stopWords.has(word)) continue;
        if (titleNoise.has(word) || word.length < 3 || /^\d+$/.test(word)) { flush(); continue; }
        segment.push(word);
      }
      flush();

      const inThisTitle = new Map();
      for (const part of segments) {
        for (const word of part) inThisTitle.set(word, Math.max(inThisTitle.get(word) || 0, 1));
        for (let index = 0; index < part.length - 1; index++) {
          const phrase = `${part[index]} ${part[index + 1]}`;
          inThisTitle.set(phrase, Math.max(inThisTitle.get(phrase) || 0, 4));
        }
      }
      for (const [topic, score] of inThisTitle) scores.set(topic, (scores.get(topic) || 0) + score);
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([topic]) => titleCase(topic));
  }

  window.cartaSuggestTopics = suggestTopics;
})();
