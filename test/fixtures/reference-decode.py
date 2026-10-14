# Independent reference decoder of the Blitzortung frames, used to produce
# frames.decoded.jsonl from frames.txt (one decoded text per line). It ports
# the map's algorithm separately from src/blitzortung/decode.js, so the test
# compares two implementations, not one with itself.
#
#   python3 -I test/fixtures/reference-decode.py test/fixtures/frames.txt test/fixtures/frames.decoded.jsonl

import json
import sys


def decode(frame):
    if not frame:
        return ''
    dictionary = {}
    first = frame[0]
    previous = first
    out = [first]
    code = 256
    for char in frame[1:]:
        k = ord(char)
        if k < 256:
            entry = char
        elif k in dictionary:
            entry = dictionary[k]
        else:
            entry = previous + previous[0]
        out.append(entry)
        dictionary[code] = previous + entry[0]
        code += 1
        previous = entry
    return ''.join(out)


source, target = sys.argv[1], sys.argv[2]
with open(source, encoding='utf-8') as frames, open(target, 'w', encoding='utf-8') as out:
    for line in frames:
        frame = line.rstrip('\n')
        if frame:
            text = decode(frame)
            json.loads(text)  # every frame must be valid JSON
            out.write(text + '\n')
