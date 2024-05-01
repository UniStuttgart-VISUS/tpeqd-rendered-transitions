#!/usr/bin/env python3

import zipfile
import json
import sys
from os.path import join
import subprocess


def load(from_dir):
    with open(join(from_dir, 'edges.json')) as f:
        j = json.load(f)

        for edge in j:
            print(F"{edge['edgeId']}: {len(edge['metadata']['frames'])} frames")

        return j


def patch(to_dir, data):
    for edge in data:
        eid = edge['edgeId']
        with zipfile.ZipFile(join(to_dir, F'{eid}.zip'), 'r') as z:
            metadata = json.loads(z.read('metadata.json'))
            from_image = z.read('from.png')
            to_image = z.read('to.png')
            metadata['frames'] = edge['metadata']['frames']
            metadata_str = json.dumps(metadata)

            with zipfile.ZipFile('tmp.zip', 'w') as z2:
                z2.writestr('from.png', from_image)
                z2.writestr('to.png', to_image)
                z2.writestr('metadata.json', metadata_str)

            out = subprocess.check_output([
                'mv',
                '-v',
                'tmp.zip',
                join(to_dir, F'{eid}.zip')
            ])
            print(out)



if __name__ == '__main__':
    from_dir, to_dir, *_ = tuple(sys.argv[1:])

    data = load(from_dir)
    patch(to_dir, data)