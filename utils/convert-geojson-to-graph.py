#!/usr/bin/env python3

import json
import zipfile
import sys
from os.path import join
import subprocess


def load_file(fname):
    with open(fname) as f:
        j = json.load(f)

        comment = F"Graph from \"{fname}\"."
        vertices = dict()

        features = [ ft for ft in j['features'] if ft['geometry']['type'] == 'Point' ]
        edges = set()
        for ft in features:
            print(ft['properties']['id'], file=sys.stderr)
            for edge in ft['properties']['links']:
                e = tuple(sorted([ft['properties']['id'], edge]))
                edges.add(e)

            props = ft['properties']
            vertex = dict(
                id=props['id'],
                label=props['name'],
                coords=ft['geometry']['coordinates'],
                zoom=12,  ## XXX
                osm_id=props['osm_id'],
                osm_name=props['osm_name'],
                osm_license=props['osm_license'],
            )
            vertices[props['id']] = vertex

        edges_dict = dict()
        for e in edges:
            edge_name = F'{e[0]}_{e[1]}'
            edges_dict[edge_name] = list(e)

        graph = dict(
            vertices=vertices,
            edges=edges_dict,
        )
        graph['$comment'] = comment

        return graph





if __name__ == '__main__':
    from_file, to_file, *_ = tuple(sys.argv[1:])

    graph = load_file(from_file)
    with open(to_file, 'w') as f:
        json.dump(graph, f, indent=2)