 // Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);

// ===== Settings =====
// DEMO_KEY works without signing up. You can swap in your own free key from https://api.nasa.gov
const API_KEY = 'DEMO_KEY';
const API_URL = 'https://api.nasa.gov/planetary/apod';
// Backup source: APOD moved to science.nasa.gov, and this feed has the real pictures
const SCIENCE_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';

// ===== Grab the rest of the page elements =====
const getImagesBtn = document.getElementById('getImagesBtn');
const gallery = document.getElementById('gallery');
const modal = document.getElementById('modal');
const modalMedia = document.getElementById('modalMedia');
const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalExplanation = document.getElementById('modalExplanation');
const closeModalBtn = document.getElementById('closeModal');
const spaceFact = document.getElementById('spaceFact');

// ===== Random "Did You Know?" fact (LevelUp) =====
const facts = [
  'A day on Venus is longer than a year on Venus.',
  'Neutron stars are so dense that a teaspoon of one would weigh about a billion tons on Earth.',
  'There are more stars in the universe than grains of sand on all of Earth\'s beaches.',
  'Footprints left on the Moon could last for millions of years because there is no wind to blow them away.',
  'Light from the Sun takes about 8 minutes to reach Earth.',
  'Jupiter\'s Great Red Spot is a storm bigger than Earth.',
  'Saturn is less dense than water. In a big enough bathtub, it would float!',
  'The International Space Station orbits Earth about 16 times a day.',
  'Olympus Mons on Mars is the tallest volcano in the solar system, about 3 times the height of Mount Everest.',
  'One million Earths could fit inside the Sun.',
];

// Pick one fact at random every time the page loads
const randomIndex = Math.floor(Math.random() * facts.length);
spaceFact.textContent = facts[randomIndex];

// We save the data from NASA here so the modal can use it later
let currentItems = [];

// ===== Helper functions =====

// Make text safe to put inside HTML (some titles have quotes or < > in them)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replaceAll('"', '&quot;');
}

// Turn "2025-07-04" into "July 4, 2025"
function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Move a "YYYY-MM-DD" date forward or back by some number of days
function shiftDate(dateString, days) {
  const date = new Date(dateString + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// Build the link to an entry's NASA page, like https://apod.nasa.gov/apod/ap250704.html
function getApodPageUrl(dateString) {
  const shortDate = dateString.slice(2).replaceAll('-', '');
  return `https://apod.nasa.gov/apod/ap${shortDate}.html`;
}

// Find the YouTube video ID in a link (returns null if it is not YouTube)
function getYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Pick the picture to show on a gallery card
function getThumbnail(item) {
  if (item.media_type === 'image') {
    return item.url;
  }
  if (item.thumbnail_url) {
    return item.thumbnail_url;
  }
  const youTubeId = item.url ? getYouTubeId(item.url) : null;
  if (youTubeId) {
    return `https://img.youtube.com/vi/${youTubeId}/hqdefault.jpg`;
  }
  return ''; // no picture available, the card shows an icon instead
}

// ===== Show messages in the gallery =====
function showLoading() {
  gallery.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon spin">🔄</div>
      <p>Loading space photos…</p>
    </div>
  `;
}

function showError(message) {
  gallery.innerHTML = `
    <div class="placeholder error">
      <div class="placeholder-icon">🛰️</div>
      <p>${message}</p>
    </div>
  `;
}

// ===== Fetch data from NASA's APOD API =====
async function getSpaceImages() {
  const startDate = startInput.value;
  const endDate = endInput.value;

  if (!startDate || !endDate || startDate > endDate) {
    showError('Please pick a start date that comes before the end date.');
    return;
  }

  showLoading();
  getImagesBtn.disabled = true;

  try {
    // Step 1: try NASA's regular APOD API first
    let items = await fetchFromApodApi(startDate, endDate);

    // Step 2: if that didn't work, use the backup feed on science.nasa.gov
    if (items === null) {
      console.log('APOD API sent placeholder data, switching to the science.nasa.gov feed');
      items = await fetchFromScienceSite(startDate, endDate);
    }

    // NASA posts each new picture around midnight Eastern time. If today's picture
    // isn't up yet, move the whole range back one day (still 9 days) and try again.
    const expectedDays = countDays(startDate, endDate);
    if (items.length < expectedDays && endDate === today) {
      startInput.value = shiftDate(startDate, -1);
      endInput.value = shiftDate(endDate, -1);
      return getSpaceImages();
    }

    // Show the newest first
    items.sort((a, b) => b.date.localeCompare(a.date));
    currentItems = items;
    displayGallery(currentItems);
  } catch (error) {
    console.error('Error fetching APOD data:', error);
    showError('Something went wrong getting the space photos. Check your connection and try again.');
  } finally {
    getImagesBtn.disabled = false;
  }
}

// Ask NASA's APOD API for the whole date range at once.
// Returns null if the API is down or only sends back NASA logo placeholders.
async function fetchFromApodApi(startDate, endDate) {
  // thumbs=true asks NASA to include a preview picture for video entries
  const url = `${API_URL}?api_key=${API_KEY}&start_date=${startDate}&end_date=${endDate}&thumbs=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`APOD API returned status ${response.status}`);
      return null;
    }

    const data = await response.json();

    // When APOD moved to science.nasa.gov, this API started sending the NASA logo
    // with the title "NASA Science" for every day. If we see that, use the backup.
    const isPlaceholder = data.every((item) => (item.url || '').includes('nasa-logo'));
    if (isPlaceholder) {
      return null;
    }
    return data;
  } catch (error) {
    console.log('APOD API request failed:', error);
    return null;
  }
}

// Backup: NASA's new APOD feed on science.nasa.gov (no API key needed).
// It only gives one day per request, so we ask for each day and wait for all of them.
async function fetchFromScienceSite(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    dates.push(date);
  }

  const requests = dates.map(async (date) => {
    // This feed wants the date as YYMMDD, like 251106
    const shortDate = date.slice(2).replaceAll('-', '');
    try {
      const response = await fetch(`${SCIENCE_URL}/${shortDate}`);
      if (!response.ok) {
        return null; // that day isn't posted yet
      }
      const data = await response.json();
      return convertScienceItem(data);
    } catch (error) {
      console.log(`Could not load ${date}:`, error);
      return null; // skip this day instead of breaking the whole gallery
    }
  });

  const results = await Promise.all(requests);
  return results.filter((item) => item !== null);
}

// Turn an item from science.nasa.gov into the same shape the APOD API uses,
// so the gallery and modal code work the same with either source
function convertScienceItem(data) {
  const imageBase = (data.hdurl || '').split('?')[0];

  const item = {
    date: data.date,
    title: htmlToText(data.title),
    explanation: cleanExplanation(data.explanation),
    media_type: data.media_type,
    url: `${imageBase}?w=800`,     // smaller picture for the gallery
    hdurl: `${imageBase}?w=2000`,  // bigger picture for the modal
    pageUrl: data.url,             // NASA's page for this entry
  };

  // For videos, find the actual video link inside the page HTML NASA sends
  if (data.media_type === 'video') {
    item.thumbnail_url = item.url;
    item.url = findVideoUrl(data.basic_html || '') || data.url;
  }

  return item;
}

// Look for a YouTube/Vimeo embed or an .mp4 file in NASA's page HTML
function findVideoUrl(html) {
  const iframe = html.match(/<iframe[^>]*src=["']([^"']+)/i);
  if (iframe) {
    return iframe[1].startsWith('//') ? `https:${iframe[1]}` : iframe[1];
  }
  const video = html.match(/<(?:video|source)[^>]*src=["']([^"']+\.(?:mp4|webm|mov))/i);
  return video ? video[1] : null;
}

// Strip HTML tags and turn codes like &#039; into real characters
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  return doc.body.textContent.trim();
}

// The new feed's explanation starts with "Explanation:" and ends with a
// "Tomorrow's picture" teaser, so take those off
function cleanExplanation(html) {
  const withoutTeaser = (html || '').split(/<strong>\s*Tomorrow/i)[0];
  return htmlToText(withoutTeaser).replace(/^Explanation:\s*/i, '');
}

// How many days are in a date range (including both ends)
function countDays(startDate, endDate) {
  const ms = new Date(endDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z');
  return Math.round(ms / 86400000) + 1;
}

// ===== Build the gallery =====
function displayGallery(items) {
  if (items.length === 0) {
    showError('No space photos were found for those dates.');
    return;
  }

  // Create one card for each item, using its index so the modal knows which one was clicked
  gallery.innerHTML = items.map((item, index) => {
    const thumbnail = getThumbnail(item);
    const isVideo = item.media_type !== 'image';

    const title = escapeHtml(item.title);
    const picture = thumbnail
      ? `<img src="${thumbnail}" alt="${title}" loading="lazy" />`
      : `<div class="no-thumb">🎬</div>`;

    const videoBadge = isVideo ? `<span class="video-badge">▶ Video</span>` : '';

    return `
      <div class="gallery-item" data-index="${index}" tabindex="0" role="button" aria-label="Open ${title}">
        <div class="image-wrap">
          ${picture}
          ${videoBadge}
        </div>
        <p class="item-title">${title}</p>
        <p class="item-date">${formatDate(item.date)}</p>
      </div>
    `;
  }).join('');
}

// ===== Modal =====
function openModal(item) {
  modalTitle.textContent = item.title;
  modalDate.textContent = formatDate(item.date);
  modalExplanation.textContent = item.explanation;

  if (item.media_type === 'image') {
    // Use the high resolution image if NASA has one
    const bigImage = item.hdurl || item.url;
    modalMedia.innerHTML = `<img src="${bigImage}" alt="${escapeHtml(item.title)}" />`;
  } else {
    modalMedia.innerHTML = getVideoHtml(item);
  }

  modal.showModal();
}

// Decide how to show a video entry (LevelUp)
function getVideoHtml(item) {
  const videoUrl = item.url || '';
  const pageLink = `<a class="video-link" href="${item.pageUrl || getApodPageUrl(item.date)}" target="_blank" rel="noopener">▶ Watch on NASA's APOD page</a>`;

  // YouTube or Vimeo: embed it right in the modal
  if (videoUrl.includes('youtube') || videoUrl.includes('youtu.be') || videoUrl.includes('vimeo')) {
    return `
      <div class="video-frame">
        <iframe src="${videoUrl}" title="${escapeHtml(item.title)}" allowfullscreen></iframe>
      </div>
      ${pageLink}
    `;
  }

  // A video file (like .mp4): play it with the video tag
  if (videoUrl.match(/\.(mp4|webm|mov)$/i)) {
    return `
      <video src="${videoUrl}" controls></video>
      ${pageLink}
    `;
  }

  // Anything else: show the thumbnail if there is one, plus a clear link
  const thumbnail = getThumbnail(item);
  const picture = thumbnail ? `<img src="${thumbnail}" alt="${escapeHtml(item.title)}" />` : '';
  return `${picture}${pageLink}`;
}

function closeModal() {
  modal.close();
}

// Stop videos from playing after the modal closes
modal.addEventListener('close', () => {
  modalMedia.innerHTML = '';
});

// ===== Event listeners =====
getImagesBtn.addEventListener('click', getSpaceImages);

// Open the modal when a gallery card is clicked
gallery.addEventListener('click', (event) => {
  const card = event.target.closest('.gallery-item');
  if (card) {
    openModal(currentItems[card.dataset.index]);
  }
});

// Let keyboard users open a card with Enter or Space
gallery.addEventListener('keydown', (event) => {
  const card = event.target.closest('.gallery-item');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openModal(currentItems[card.dataset.index]);
  }
});

closeModalBtn.addEventListener('click', closeModal);

// Close the modal when clicking the dark area outside it
modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});