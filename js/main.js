const placeMediaById = new Map();
const pathMediaById = new Map();

function normalizePhotos(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry.src !== "string") {
        return null;
      }

      const caption =
        typeof entry.caption === "string" && entry.caption.trim().length > 0
          ? entry.caption.trim()
          : null;

      return {
        src: entry.src,
        caption,
      };
    })
    .filter(Boolean);
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [0, 20],
  zoom: 1.5,
  attributionControl: true,
});

map.addControl(
  new maplibregl.NavigationControl({ visualizePitch: true }),
  "top-left"
);

const photoModal = (() => {
  const modal = document.getElementById("photo-modal");
  if (!modal) {
    return { open: () => {}, close: () => {} };
  }

  const overlay = modal.querySelector(".photo-modal__overlay");
  const dialog = modal.querySelector(".photo-modal__dialog");
  const closeButton = modal.querySelector(".photo-modal__close");
  const titleElement = modal.querySelector(".photo-modal__title");
  const bodyElement = modal.querySelector(".photo-modal__body");
  const focusableSelector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  let previousActiveElement = null;
  let currentPhotos = [];
  let currentIndex = 0;
  let thumbnailButtons = [];
  let structureInitialized = false;

  let viewer = null;
  let viewerImage = null;
  let viewerCaption = null;
  let prevButton = null;
  let nextButton = null;
  let thumbnailsContainer = null;

  function getFocusableElements() {
    if (!dialog) {
      return [];
    }
    return Array.from(dialog.querySelectorAll(focusableSelector));
  }

  function ensureStructure() {
    if (!bodyElement || structureInitialized) {
      return;
    }

    bodyElement.innerHTML = "";

    viewer = document.createElement("div");
    viewer.className = "photo-modal__viewer";

    prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "photo-modal__nav-button";
    prevButton.setAttribute("aria-label", "Show previous photo");
    prevButton.textContent = "<";

    const viewerFrame = document.createElement("div");
    viewerFrame.className = "photo-modal__viewer-frame";

    viewerImage = document.createElement("img");
    viewerImage.className = "photo-modal__viewer-media";
    viewerImage.alt = "";
    viewerImage.decoding = "async";
    viewerImage.loading = "eager";
    viewerFrame.appendChild(viewerImage);

    nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "photo-modal__nav-button";
    nextButton.setAttribute("aria-label", "Show next photo");
    nextButton.textContent = ">";

    viewer.append(prevButton, viewerFrame, nextButton);

    viewerCaption = document.createElement("p");
    viewerCaption.className = "photo-modal__viewer-caption";

    thumbnailsContainer = document.createElement("div");
    thumbnailsContainer.className = "photo-modal__thumbnails";

    bodyElement.append(viewer, viewerCaption, thumbnailsContainer);

    prevButton.addEventListener("click", showPrev);
    nextButton.addEventListener("click", showNext);

    structureInitialized = true;
  }

  function updateNavState() {
    const disabled = currentPhotos.length <= 1;
    if (prevButton) {
      prevButton.disabled = disabled;
    }
    if (nextButton) {
      nextButton.disabled = disabled;
    }
  }

  function updateThumbnails() {
    if (!thumbnailButtons || thumbnailButtons.length === 0) {
      return;
    }

    thumbnailButtons.forEach((button, index) => {
      if (!button) {
        return;
      }
      if (index === currentIndex) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "true");
        if (thumbnailsContainer && !thumbnailsContainer.hidden) {
          button.scrollIntoView({ block: "nearest", inline: "center" });
        }
      } else {
        button.classList.remove("is-active");
        button.removeAttribute("aria-current");
      }
    });
  }

  function updateViewer() {
    if (!viewerImage || currentPhotos.length === 0) {
      return;
    }

    const photo = currentPhotos[currentIndex];
    const fallbackCaption = `Photo ${currentIndex + 1}`;
    const caption = photo.caption || fallbackCaption;

    viewerImage.src = photo.src;
    viewerImage.alt = caption;

    if (viewerCaption) {
      viewerCaption.textContent = caption;
    }

    updateNavState();
    updateThumbnails();
  }

  function setCurrentIndex(index) {
    if (currentPhotos.length === 0) {
      return;
    }
    const total = currentPhotos.length;
    currentIndex = ((index % total) + total) % total;
    updateViewer();
  }

  function showPrev() {
    if (currentPhotos.length <= 1) {
      return;
    }
    setCurrentIndex(currentIndex - 1);
  }

  function showNext() {
    if (currentPhotos.length <= 1) {
      return;
    }
    setCurrentIndex(currentIndex + 1);
  }

  function buildThumbnails() {
    if (!thumbnailsContainer) {
      return;
    }

    thumbnailsContainer.innerHTML = "";
    thumbnailButtons = [];

    if (currentPhotos.length <= 1) {
      thumbnailsContainer.hidden = true;
      return;
    }

    thumbnailsContainer.hidden = false;

    thumbnailButtons = currentPhotos.map((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "photo-modal__thumbnail-button";
      button.setAttribute(
        "aria-label",
        photo.caption ? `View ${photo.caption}` : `View photo ${index + 1}`
      );
      button.dataset.index = String(index);

      const thumb = document.createElement("img");
      thumb.src = photo.src;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.className = "photo-modal__thumbnail-image";
      button.appendChild(thumb);

      button.addEventListener("click", () => {
        setCurrentIndex(index);
      });

      thumbnailsContainer.appendChild(button);
      return button;
    });
  }

  function renderPhotos(title, photos) {
    if (!titleElement || !bodyElement) {
      return;
    }

    ensureStructure();

    titleElement.textContent = title;
    currentPhotos = photos;
    currentIndex = 0;

    buildThumbnails();

    if (currentPhotos.length === 0) {
      return;
    }

    updateNavState();
    setCurrentIndex(0);
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", handleKeydown, true);

    if (
      previousActiveElement &&
      typeof previousActiveElement.focus === "function"
    ) {
      previousActiveElement.focus();
    }
    previousActiveElement = null;
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowLeft") {
      if (currentPhotos.length > 1) {
        event.preventDefault();
        showPrev();
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (currentPhotos.length > 1) {
        event.preventDefault();
        showNext();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(title, photos) {
    if (!Array.isArray(photos) || photos.length === 0) {
      return;
    }

    previousActiveElement = document.activeElement;
    renderPhotos(title, photos);

    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeydown, true);

    if (closeButton) {
      window.requestAnimationFrame(() => {
        closeButton.focus();
      });
    }
  }

  if (overlay) {
    overlay.addEventListener("click", close);
  }

  if (closeButton) {
    closeButton.addEventListener("click", close);
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      close();
    }
  });

  return { open, close };
})();

let activeYear = null;

function applyYearFilter(year) {
  activeYear = year;
  const layerId = "places-dots";
  if (!map.getLayer(layerId)) {
    return;
  }

  if (!year) {
    map.setFilter(layerId, ["all"]);
  } else {
    map.setFilter(layerId, ["==", ["get", "year"], year]);
  }
}

function hideLabels() {
  const style = map.getStyle();
  if (!style?.layers) {
    return;
  }

  style.layers
    .filter((layer) => layer.type === "symbol")
    .forEach((layer) => {
      try {
        map.setLayoutProperty(layer.id, "visibility", "none");
      } catch (error) {
        console.error(`Failed to hide label layer ${layer.id}`, error);
      }
    });
}

map.on("styledata", hideLabels);

function countryCodeToFlagEmoji(code) {
  if (!code) {
    return null;
  }
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2) {
    return null;
  }
  return String.fromCodePoint(
    ...upper.split("").map((char) => 127397 + char.charCodeAt(0))
  );
}

class YearFilterControl {
  constructor(onChange) {
    this._onChange = onChange;
    this._container = null;
    this._select = null;
  }

  onAdd(mapInstance) {
    this._map = mapInstance;
    this._container = document.createElement("div");
    this._container.className =
      "maplibregl-ctrl maplibregl-ctrl-group year-filter-ctrl";

    const label = document.createElement("label");
    label.className = "year-filter-label";
    label.textContent = "Year";
    label.setAttribute("for", "year-filter-select");

    this._select = document.createElement("select");
    this._select.className = "year-filter-select";
    this._select.id = "year-filter-select";
    this._select.innerHTML = '<option value="">All</option>';
    this._select.addEventListener("change", () => {
      const value = this._select?.value ?? "";
      this._onChange(value === "" ? null : value);
    });

    this._container.appendChild(label);
    this._container.appendChild(this._select);

    return this._container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._select = null;
    this._container = null;
    this._map = null;
  }

  setYears(years) {
    if (!this._select) {
      return;
    }

    const options = ['<option value="">All</option>'];
    years.forEach((year) => {
      options.push(`<option value="${year}">${year}</option>`);
    });
    this._select.innerHTML = options.join("");

    if (activeYear) {
      this._select.value = activeYear;
    }
  }
}

const yearFilterControl = new YearFilterControl(applyYearFilter);
map.addControl(yearFilterControl, "top-left");

async function loadPlaces() {
  try {
    const response = await fetch("data/places.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load places: ${response.status}`);
    }
    const rawPlaces = await response.json();

    placeMediaById.clear();

    const geojson = {
      type: "FeatureCollection",
      features: rawPlaces.map((place) => {
        const photos = normalizePhotos(place.photos);
        const photosKey = typeof place.id === "string" ? place.id : null;

        if (photosKey && photos.length > 0) {
          placeMediaById.set(photosKey, photos);
        }

        return {
          type: "Feature",
          id: place.id,
          geometry: {
            type: "Point",
            coordinates: [place.lon, place.lat],
          },
          properties: {
            name: place.name,
            visitedOn: place.visitedOn ?? null,
            notes: place.notes ?? null,
            country: place.country ?? null,
            flag: countryCodeToFlagEmoji(place.country ?? null),
            type: place.type ?? null,
            year: place.visitedOn ? String(place.visitedOn).slice(0, 4) : null,
            hasPhotos: photos.length > 0,
            photosKey,
          },
        };
      }),
    };

    map.addSource("places", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "places-dots",
      type: "circle",
      source: "places",
      layout: {
        "circle-sort-key": [
          "match",
          ["get", "type"],
          "home",
          3,
          "future",
          2.5,
          "national-park",
          2,
          1,
        ],
      },
      paint: {
        "circle-radius": [
          "match",
          ["get", "type"],
          "home",
          7,
          "future",
          6,
          "national-park",
          6,
          5,
        ],
        "circle-color": [
          "match",
          ["get", "type"],
          "home",
          "#f25f5c",
          "future",
          "#bb86fc",
          "national-park",
          "#4caf50",
          "#f4d35e",
        ],
        "circle-stroke-color": "#0b0d12",
        "circle-stroke-width": 1,
        "circle-opacity": 0.9,
      },
    });

    const years = Array.from(
      new Set(
        rawPlaces
          .map((place) =>
            place.visitedOn ? String(place.visitedOn).slice(0, 4) : null
          )
          .filter(Boolean)
      )
    ).sort((a, b) => Number(b) - Number(a));

    yearFilterControl.setYears(years);
    applyYearFilter(activeYear);

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnMove: true,
    });

    map.on("mouseenter", "places-dots", (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }

      map.getCanvas().style.cursor = feature.properties?.hasPhotos
        ? "pointer"
        : "";

      const { name, flag } = feature.properties;
      const label = flag ? `${flag} ${name}` : name;
      const coordinates = feature.geometry.coordinates.slice();

      while (Math.abs(event.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += event.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      hoverPopup.setLngLat(coordinates).setText(label).addTo(map);
    });

    map.on("mouseleave", "places-dots", () => {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadPaths() {
  try {
    const manifestResponse = await fetch("data/paths/index.json", {
      cache: "no-store",
    });
    if (!manifestResponse.ok) {
      if (manifestResponse.status === 404) {
        return;
      }
      throw new Error(
        `Failed to load path manifest: ${manifestResponse.status}`
      );
    }

    const manifest = await manifestResponse.json();
    if (!Array.isArray(manifest) || manifest.length === 0) {
      return;
    }

    pathMediaById.clear();

    const features = (
      await Promise.all(
        manifest.map(async (fileName) => {
          try {
            const response = await fetch(`data/paths/${fileName}`, {
              cache: "no-store",
            });
            if (!response.ok) {
              throw new Error(
                `Failed to load path file ${fileName}: ${response.status}`
              );
            }
            const path = await response.json();
            if (!Array.isArray(path.points) || path.points.length < 2) {
              return null;
            }

            const coordinates = path.points.map((point) => {
              const [lat, lon] = point;
              return [lon, lat];
            });

            const pathId = path.id ?? fileName;
            const photos = normalizePhotos(path.photos);
            if (pathId && photos.length > 0) {
              pathMediaById.set(pathId, photos);
            }

            return {
              type: "Feature",
              id: pathId,
              geometry: {
                type: "LineString",
                coordinates,
              },
              properties: {
                name: path.name ?? path.id ?? fileName,
                type: path.type ?? "route",
                hasPhotos: photos.length > 0,
                photosKey: pathId,
              },
            };
          } catch (error) {
            console.error(error);
            return null;
          }
        })
      )
    ).filter(Boolean);

    if (features.length === 0) {
      return;
    }

    map.addSource("paths", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    map.addLayer({
      id: "paths-lines",
      type: "line",
      source: "paths",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-width": [
          "match",
          ["get", "type"],
          "road",
          2,
          "trail",
          2,
          "hike",
          2,
          "route",
          2,
          2,
        ],
        "line-color": [
          "match",
          ["get", "type"],
          "road",
          "#5ec8e5",
          "trail",
          "#f4d35e",
          "hike",
          "#81c784",
          "route",
          "#c792ea",
          "#5ec8e5",
        ],
        "line-opacity": 0.75,
      },
    });

    if (map.getLayer("places-dots")) {
      map.moveLayer("places-dots");
    }

    const pathPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnMove: true,
    });

    map.on("mousemove", "paths-lines", (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }

      const { name } = feature.properties ?? {};
      if (!name) {
        return;
      }

      map.getCanvas().style.cursor = feature.properties?.hasPhotos
        ? "pointer"
        : "";
      pathPopup.setLngLat(event.lngLat).setText(name).addTo(map);
    });

    map.on("mouseleave", "paths-lines", () => {
      map.getCanvas().style.cursor = "";
      pathPopup.remove();
    });
  } catch (error) {
    console.error(error);
  }
}

function handlePlaceClick(event) {
  const feature = event.features?.[0];
  if (!feature) {
    return;
  }

  const key = feature.properties?.photosKey ?? feature.id;
  const photos = key ? placeMediaById.get(key) : null;
  if (!photos || photos.length === 0) {
    return;
  }

  const title = feature.properties?.name ?? "Photo gallery";
  photoModal.open(title, photos);
}

function handlePathClick(event) {
  const feature = event.features?.[0];
  if (!feature) {
    return;
  }

  const key = feature.properties?.photosKey ?? feature.id;
  const photos = key ? pathMediaById.get(key) : null;
  if (!photos || photos.length === 0) {
    return;
  }

  const title = feature.properties?.name ?? "Photo gallery";
  photoModal.open(title, photos);
}

map.on("load", () => {
  loadPlaces();
  loadPaths();
  map.on("click", "places-dots", handlePlaceClick);
  map.on("click", "paths-lines", handlePathClick);
});
