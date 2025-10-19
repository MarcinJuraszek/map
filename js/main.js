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

    const geojson = {
      type: "FeatureCollection",
      features: rawPlaces.map((place) => ({
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
        },
      })),
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
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }

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

            return {
              type: "Feature",
              id: path.id ?? fileName,
              geometry: {
                type: "LineString",
                coordinates,
              },
              properties: {
                name: path.name ?? path.id ?? fileName,
                type: path.type ?? "route",
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

      map.getCanvas().style.cursor = "pointer";
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

map.on("load", () => {
  loadPlaces();
  loadPaths();
});
