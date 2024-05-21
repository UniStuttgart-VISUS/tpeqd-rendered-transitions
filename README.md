Source code: [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.11097470.svg)](https://doi.org/10.5281/zenodo.11097470)  
Compiled demo: [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.11236514.svg)](https://doi.org/10.5281/zenodo.11236514)

Generate animated zoom-and-pan transitions between geographical locations in two-point equidistant projection.
Transitions are pre-rendered and stored as videos.
The web-based client loads the videos on demand.
During the transition, off-screen locations of interest are indicated in the direction they lie.

Maps are rendered based on [NaturalEarth data](https://www.naturalearthdata.com/) for the overview parts (low level of detail).
For this, the GeoJSON versions of some NaturalEarth files need to be downloaded and put in the [./data](./data) folder with specific file names.
Use or reference the [download script](./utils/download-data.sh) in the [./utils](./utils) folder.
The [repository of martynafford](https://github.com/martynafford/natural-earth-geojson) can be used for a pre-converted GeoJSON variant of the data.

For high-level-of-detail maps, OpenStreetMap data is used.
This data is loaded on demand for the areas where the details are needed, using the Overpass API.
By default, the code expects an Overpass API instance to be reachable on `http://localhost:27080`.
It is a good idea to use a local instance here, as a lot of queries with rather large result datasets need to be submitted in a short timespan.
Refer to the [connection script](./utils/open-connection-to-overpass.sh) on how to make an instance running on a different machine available.
Refer to the source code in [`overpass.ts`](./src/generator/overpass.ts) on how to change the address of the Overpass API instance.

The Overpass API queries often failed to retrieve seas and oceans within specified bounding boxes, because this data consists of very large polygons, sometimes only implicitly defined by coastlines.
Hence, a [collected ESRI shape file](https://osmdata.openstreetmap.de/data/water-polygons.html) of water polygons is used here.
This needs to be downloaded and indexed as well.
The aforementioned download script handles that as well.
For the download script and the later extraction of relevant data to work, `ogr2ogr` and `ogrinfo` (usually part of [GDAL](https://gdal.org/programs/index.html)) need to be installed on the system.
