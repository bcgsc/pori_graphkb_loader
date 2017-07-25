import re
import sys
import itertools
import os
import json
import uuid
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm.session import sessionmaker

path = os.path.dirname(os.path.realpath(__file__))

sys.path.insert(0, path)

import kb_tools
from kb_tools.kb_io import load_kb
from kb_tools.event import Event
from kb_tools.feature import Feature
from kb_tools.coordinate_notation import VariantNotation
from kb_tools.statement import *
from kb_tools import TSV
from kb_tools.util import ReMatch
from kb_tools.util import PATTERNS as pt
from kb_tools.util import MATCH_TYPE as mt
from kb_tools.disease import Disease
from kb_tools.literature import Literature
from kb_tools.position import Position
import pdb

import doctest
import re
from collections import defaultdict

doctest.testmod(kb_tools.error)
doctest.testmod(kb_tools.util)
doctest.testmod(kb_tools.feature)
doctest.testmod(kb_tools.literature)
doctest.testmod(kb_tools.statement)
doctest.testmod(kb_tools.position)
doctest.testmod(kb_tools.coordinate_notation)
doctest.testmod(kb_tools.event)
doctest.testmod(kb_tools.review)
doctest.testmod(kb_tools.entry)
doctest.testmod(kb_tools.kb_io)
ref_json = []


def submit_to_json(ref_json, entry_hash, event):
    uuid_str = str(uuid.uuid4())
    ref_json[uuid_str].append(dict(entry_hash, **event))

def main():
    ref_json = defaultdict(list)
    print('[LOADING] ({0}) the knowledgebase flatfiles'.format(datetime.now()))
    kb = load_kb(
        'knowledge_base_events.tsv',
        'knowledge_base_references.tsv',
        'disease_ontology.tsv'
    )
    row_count = 0
    for ekey, entry in list(kb.entries.items())[0:-1]:

        flag = False
        # initialization
        entry_hash = {}
        statement = {}
        disease = {}
        event = {}
        primary_feature = {}
        secondary_feature = {}
        reference = {}

        # statement
        statement['type'] = entry.statement.type
        statement['relevance'] = entry.statement.relevance
        if statement['relevance'] == 'gain-of-function':
            statement['relevance'] = 'gain';

        if (' ' in entry.statement.context) or (';' in entry.statement.context):
            continue;
        elif statement['type'] == 'therapeutic':
                statement['context'] = entry.statement.context
        else:
            statement['context'] = entry.statement.context
        entry_hash['statement'] = statement


        #disease
        if entry.disease != "not specified":
            disease['name'] = entry.disease
        else:
            disease['name'] = None
        entry_hash['disease'] = disease

        # status
        event['status'] = str(entry.combination.events[0][1])

        # zygosity
        event['zygosity'] = str(entry.combination.events[0][2])

        # germline
        m = re.search('.*\((\w*)\)', entry.combination.events[0][2])
        if m:
            event['germline'] = m.group(1)
        else:
            event['germline'] = ''

        # reference
        reference['type'] = entry.evidence
        reference['id_type'] = entry.literature.type
        reference['id'] = entry.literature.id
        reference['title'] = entry.literature.title
        entry_hash['reference'] = reference

        # event
        event['type'] = entry.combination.events[0][0].type
        if event['type'] == 'SV':
            event['type'] = 'structural variant';
        elif event['type'] == 'CNV':
            event['type'] = 'copy number variant';
        elif event['type'] == 'MUT':
            event['type'] = 'mutation';
        combination_event = entry.combination.events[0][0]
        cv_notation = combination_event.cv_notation
        cn_notation = combination_event.cn_notation
        if cv_notation != None:
            event['flag'] = 'CategoryEvent'
            event['term'] = cv_notation
            primary_feature['biotype'] = combination_event.name_feature.subtype
            if primary_feature['biotype'] == 'gene fusion':
                primary_feature['biotype'] = 'fusion';
            elif primary_feature['biotype'] == 'chromosome':
                primary_feature['biotype'] = 'template';
            elif primary_feature['biotype'] == 'cds':
                primary_feature['biotype'] = 'transcript';
            primary_feature['source'] = combination_event.name_feature.type
            if primary_feature['source'] == 'chromosome':
                primary_feature['source'] = 'genome reference consortium (human)'
            primary_feature['name'] = combination_event.name_feature.id
            event['primary_feature'] = primary_feature
            event['secondary_feature'] = secondary_feature
            uuid_str = str(uuid.uuid4())
            entry_hash['event'] = event
            ref_json[uuid_str].append(entry_hash)

        elif cn_notation:
            event['flag'] = 'PositionalEvent'

            position_x1 = cn_notation.break_x1 or None
            position_x2 = cn_notation.break_x2 or None
            position_y1 = cn_notation.break_y1 or None
            position_y2 = cn_notation.break_y2 or None

            if cn_notation.type == 'fs' or cn_notation.type == 'ext':
                m = re.search('(\w?)\*?(\d*)', cn_notation.alt)
                if m is not None:
                    event['untemplated_seq'] = m.group(1)
                    event['termination_aa'] = m.group(2)
                else:
                    event['untemplated_seq'] = None
                    event['termination_aa'] = None
            else:
                event['untemplated_seq'] = cn_notation.alt
                event['termination_aa'] = None

            event['reference_seq'] = cn_notation.ref
            event['csys'] = cn_notation.csys

            position = {}
            if event['csys'] == 'c':
                if position_x1.c is None and position_x1.b is None:
                    px1c = px1b = 0
                else:
                    px1c = str(position_x1.c)
                    px1b = str(position_x1.b)
                if position_x2 is not None:
                    if position_x2.c is None and position_x2.b is None:
                        px2c = px2b = 0
                    else:
                        px2c = str(position_x2.c)
                        px2b = str(position_x2.b)
                if position_y1 is not None:
                    if position_y1.c is None and position_y1.b is None:
                        py1c = py1b = 0
                    else:
                        py1c = str(position_y1.c)
                        py1b = str(position_y1.b)
                if position_y2 is not None:
                    if position_y2.c is None and position_y2.b is None:
                        py2c = py2b = 0
                    else:
                        py2c = str(position_y2.c)
                        py2b = str(position_y2.b)

                if position_x1 is not None and position_x2 is not None:
                    event['start'] = [{'pos': position_x1.a, 'offset': px1c + px1b},
                                      {'pos': position_x2.a, 'offset': px2c + px2b}]
                elif position_x1:
                    event['start'] = {'pos': position_x1.a, 'offset': px1c + px1b}

                if position_y1 is not None and position_y2 is not None:
                    event['end'] = [{'pos': position_y1.a, 'offset': py1c + py1b},
                                      {'pos': position_y2.a, 'offset': py2c + py2b}]
                elif position_y1:
                    event['end'] = {'pos': position_y1.a, 'offset': py1c + py1b}
            elif event['csys'] == 'p':
                if position_x1 is not None and position_x2 is not None:
                    event['start'] = [{'pos': position_x1.a, 'ref_aa': position_x1.c},
                                      {'pos': position_x2.a, 'ref_aa': position_x2.c}]
                elif position_x1:
                    event['start'] = {'pos': position_x1.a, 'ref_aa': position_x1.c}

                if position_y1 is not None and position_y2 is not None:
                    event['end'] = [{'pos': position_y1.a, 'ref_aa': position_y1.c},
                                      {'pos': position_y2.a, 'ref_aa': position_y2.c}]
                elif position_y1:
                    event['end'] = {'pos': position_y1.a, 'ref_aa': position_y1.c}
            elif event['csys'] == 'y':
                if position_x1 is not None and position_x2 is not None:
                    event['start'] = [{'arm': position_x1.c, 'major_band': str(position_x1.a), 'minor_band': str(position_x1.b)},
                                      {'arm': position_x2.c, 'major_band': str(position_x2.a), 'minor_band': str(position_x2.b)}]
                elif position_x1:
                    event['start'] = {'arm': position_x1.c, 'major_band': str(position_x1.a), 'minor_band': str(position_x1.b)}

                if position_y1 is not None and position_y2 is not None:
                    event['end'] = [{'arm': position_y1.c, 'major_band': str(position_y1.a), 'minor_band': str(position_y1.b)},
                                      {'arm': position_y2.c, 'major_band': str(position_y2.a), 'minor_band': str(position_y2.b)}]
                elif position_y1:
                    event['end'] = {'arm': position_y1.c, 'major_band': str(position_y1.a), 'minor_band': str(position_y1.b)}
            elif event['csys'] == 'g' or event['csys'] == 'e':
                if position_x1 is not None and position_x2 is not None:
                    event['start'] = [{'pos': position_x1.a}, {'pos':position_x2.a}]
                elif position_x1:
                    event['start'] = {'pos': position_x1.a}

                if position_y1 is not None and position_y2 is not None:
                    event['end'] = [{'pos': position_y1.a}, {'pos':position_y2.a}]
                elif position_y1:
                    event['end'] = {'pos': position_y1.a}

            event['subtype'] = combination_event.cn_notation.type
            if  event['subtype'] == 'mis':
                event['subtype'] = '>';
            elif event['subtype'] == 'fusion':
                event['subtype'] = 'fus';

            event['primary_feature'] = {}
            event['secondary_feature'] = {}

            if cn_notation.bn:
                # breakpoint_event
                for xy_feature in zip(cn_notation.xfeatures, cn_notation.yfeatures):
                    primary_feature = {}
                    secondary_feature = {}
                    if len(xy_feature) > 0:
                        primary_feature['biotype'] = xy_feature[0].subtype
                        if primary_feature['biotype'] == 'gene fusion':
                            primary_feature['biotype'] = 'fusion';
                        elif primary_feature['biotype'] == 'chromosome':
                            primary_feature['biotype'] = 'template';
                        elif primary_feature['biotype'] == 'cds':
                            primary_feature['biotype'] = 'transcript';
                        primary_feature['source'] = xy_feature[0].type
                        if primary_feature['source'] == 'chromosome':
                            primary_feature['source'] = 'genome reference consortium (human)'
                        primary_feature['name'] = xy_feature[0].id
                        secondary_feature['biotype'] = xy_feature[1].subtype
                        if secondary_feature['biotype'] == 'gene fusion':
                            secondary_feature['biotype'] = 'fusion';
                        elif secondary_feature['biotype'] == 'chromosome':
                            secondary_feature['biotype'] = 'template';
                        elif secondary_feature['biotype'] == 'cds':
                            secondary_feature['biotype'] = 'transcript';
                        secondary_feature['source'] = xy_feature[1].type
                        if secondary_feature['source'] == 'chromosome':
                            secondary_feature['source'] = 'genome reference consortium (human)'
                        secondary_feature['name'] = xy_feature[1].id
                    else:
                        x1_feature = cn_notation.xfeatures[0]
                        primary_feature['biotype'] = x1_feature.subtype
                        if primary_feature['biotype'] == 'gene fusion':
                            primary_feature['biotype'] = 'fusion';
                        elif primary_feature['biotype'] == 'chromosome':
                            primary_feature['biotype'] = 'template';
                        elif primary_feature['biotype'] == 'cds':
                            primary_feature['biotype'] = 'transcript';
                        primary_feature['source'] = x1_feature.type
                        if primary_feature['source'] == 'chromosome':
                            primary_feature['source'] = 'genome reference consortium (human)'
                        primary_feature['name'] = x1_feature.id
                    event['primary_feature'] = primary_feature
                    event['secondary_feature'] = secondary_feature
                    uuid_str = str(uuid.uuid4())
                    entry_hash['event'] = event
                    ref_json[uuid_str].append(entry_hash)

            else:
                # continues_event
                features = cn_notation.xfeatures + cn_notation.yfeatures
                for feature in features:
                    primary_feature = {}
                    primary_feature['biotype'] = feature.subtype
                    if primary_feature['biotype'] == 'gene fusion':
                        primary_feature['biotype'] = 'fusion';
                    elif primary_feature['biotype'] == 'chromosome':
                        primary_feature['biotype'] = 'template';
                    elif primary_feature['biotype'] == 'cds':
                        primary_feature['biotype'] = 'transcript';
                    primary_feature['source'] = feature.type
                    if primary_feature['source'] == 'chromosome':
                        primary_feature['source'] = 'genome reference consortium (human)'
                    primary_feature['name'] = feature.id
                    event['primary_feature'] = primary_feature
                    uuid_str = str(uuid.uuid4())
                    entry_hash['event'] = event
                    ref_json[uuid_str].append(entry_hash)

    uniq_items = {}
    for key, value in ref_json.items():
        if value not in uniq_items.values():
            holder = {}
            for sub_dict in value:
                holder.update(sub_dict)
            uniq_items[key] = holder


    json_str = json.dumps(uniq_items)
    print(str(json_str))


if __name__ == "__main__":
    main()

