#!/usr/bin/env bash
set -euo pipefail

CACHE="${1:-/tmp/area-cache}"
mkdir -p "$CACHE"
cd "$CACHE"

curl -sfL -o mazowieckie.osm.pbf https://download.geofabrik.de/europe/poland/mazowieckie-latest.osm.pbf
curl -sfL -o malopolskie.osm.pbf https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf
curl -sfL -o gtfs-warszawa.zip https://mkuran.pl/gtfs/warsaw.zip
curl -sfL -o gtfs-krakow-t.zip https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip
curl -sfL -o gtfs-krakow-a.zip https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip

osmium extract -b 20.83,52.08,21.29,52.38 mazowieckie.osm.pbf -o warszawa.osm.pbf --overwrite -s smart
osmium extract -b 19.76,49.95,20.24,50.14 malopolskie.osm.pbf -o krakow.osm.pbf --overwrite -s smart

for city in warszawa krakow; do
  osmium tags-filter "$city.osm.pbf" \
    r/boundary=administrative \
    nwr/amenity=cafe,restaurant,marketplace,theatre,cinema,arts_centre,library,coworking_space \
    nwr/shop=supermarket,greengrocer,bakery,deli,health_food,books,alcohol,wine \
    nwr/office=coworking \
    nwr/leisure=fitness_centre,sports_centre,swimming_pool,park,garden,nature_reserve \
    nwr/sport=climbing,yoga,swimming \
    nwr/tourism=museum,gallery \
    n/railway=tram_stop,station,halt n/highway=bus_stop n/public_transport=station,stop_position \
    w/highway=motorway,trunk,primary,motorway_link,trunk_link,primary_link,cycleway,path,footway \
    w/cycleway w/cycleway:left w/cycleway:right w/cycleway:both \
    nwr/landuse=forest,meadow,grass,recreation_ground,village_green \
    nwr/natural=wood,grassland,scrub,heath \
    -o "$city-f.osm.pbf" --overwrite
  osmium export "$city-f.osm.pbf" -f geojsonseq -u type_id -a type,id -o "$city.geojsonseq" --overwrite -x print_record_separator=false
done

for feed in gtfs-warszawa gtfs-krakow-t gtfs-krakow-a; do
  mkdir -p "$feed"
  unzip -oq "$feed.zip" -d "$feed"
done
