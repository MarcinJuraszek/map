from pathlib import Path
from typing import Dict, List
import argparse
import json
import itertools


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert GeoJSON LineString features into path files for the map."
    )
    parser.add_argument("input", type=Path, help="Path to the input GeoJSON file.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "paths",
        help="Directory where individual path files will be written.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Optional path to the manifest file. Defaults to <output-dir>/index.json.",
    )
    parser.add_argument(
        "--default-name",
        type=str,
        help="Name to use when a feature does not provide one in properties.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    output_dir = args.output_dir if args.output_dir.is_absolute() else Path.cwd() / args.output_dir
    manifest_path = args.manifest if args.manifest else output_dir / "index.json"

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    with args.input.open() as fh:
        geo = json.load(fh)

    manifest: List[str] = []
    slug_counts: Dict[str, int] = {}
    for idx, feature in enumerate(geo.get("features", []), start=1):
        geom = feature.get("geometry", {})
        coords = geom.get("coordinates")
        if geom.get("type") == "LineString":
            track = coords
        elif geom.get("type") == "MultiLineString":
            track = list(itertools.chain.from_iterable(coords))
        else:
            continue

        properties = feature.get("properties", {}) or {}
        name = properties.get("name") or args.default_name or f"Path {idx}"
        slug_base = name.lower().replace(" ", "-") or f"path-{idx}"
        count = slug_counts.get(slug_base, 0)
        slug_counts[slug_base] = count + 1
        slug = slug_base if count == 0 else f"{slug_base}-{count + 1}"
        filename = f"{slug}.json"

        points = [[lat, lon] for lon, lat, *_ in track]
        payload = {"id": slug, "name": name, "type": "track", "points": points}

        with (output_dir / filename).open("w") as out:
            json.dump(payload, out, indent=2)

        manifest.append(filename)

    with manifest_path.open("w") as out:
        json.dump(manifest, out, indent=2)


if __name__ == "__main__":
    main()