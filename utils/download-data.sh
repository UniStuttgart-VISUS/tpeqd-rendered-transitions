#!/usr/bin/env bash

set -euo pipefail

if [[ ! -f utils/download-data.sh ]]
then
  1>&2 echo "Error: This file should be executed from the root directory of the repository!"
  exit 1
fi

mkdir -p data

# download NaturalEarth data
dl_ne() {
  echo "  downloading \"$2/$1/ne_${2}_${3}.json\""
  return
  curl \
    --output "data/ne_${2}_${3}.json" \
    "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/$2/$1/ne_${2}_${3}.json"
}


echo -e "DOWNLOADING CULTURAL NATURALEARTH DATA\n"

dl_ne cultural 10m admin_0_boundary_lines_disputed_areas
dl_ne cultural 10m admin_0_boundary_lines_land
dl_ne cultural 10m admin_1_states_provinces_lines
dl_ne cultural 10m parks_and_protected_lands_area
dl_ne cultural 10m populated_places
dl_ne cultural 10m railroads
dl_ne cultural 10m roads
dl_ne cultural 10m urban_areas
dl_ne cultural 110m admin_0_boundary_lines_land
dl_ne cultural 110m admin_1_states_provinces_lines
dl_ne cultural 110m populated_places
dl_ne cultural 50m admin_0_boundary_lines_disputed_areas
dl_ne cultural 50m admin_0_boundary_lines_land
dl_ne cultural 50m admin_1_states_provinces_lines
dl_ne cultural 50m populated_places
dl_ne cultural 50m urban_areas


echo -e "\n\nDOWNLOADING CULTURAL NATURALEARTH DATA\n"

dl_ne physical 10m antarctic_ice_shelves_polys
dl_ne physical 10m glaciated_areas
dl_ne physical 10m lakes
dl_ne physical 10m land
dl_ne physical 10m ocean
dl_ne physical 10m reefs
dl_ne physical 10m rivers_lake_centerlines
dl_ne physical 50m antarctic_ice_shelves_polys
dl_ne physical 50m glaciated_areas
dl_ne physical 50m lakes
dl_ne physical 50m land
dl_ne physical 50m rivers_lake_centerlines
dl_ne physical 110m glaciated_areas
dl_ne physical 110m lakes
dl_ne physical 110m land
dl_ne physical 110m rivers_lake_centerlines


echo -e "\n\nDOWNLOADING OPENSTREETMAP WATER POLYGONS\n"

tmpdir=$(mktemp -d)
echo curl \
  --output "$tmpdir/osm.zip" \
  "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"

pushd $tmpdir
unzip "$tmpdir/osm.zip"
popd

for ending in dbf prj shp shx
do
  cp -v "$tmpdir/water-polygons-split-4326/water_polygons.$ending" "data/osm_water_polygons.$ending"
done

rm -rf $tmpdir


echo -e "\nINDEXING OPENSTREETMAP WATER POLYGONS\n"

pushd data
ogrinfo --config CPL_DEBUG ON -sql 'CREATE SPATIAL INDEX ON osm_water_polygons' osm_water_polygons.shp
popd