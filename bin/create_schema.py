import requests
from requests.auth import HTTPBasicAuth
import argparse
import os
import json

# using environment variables for now, will make authentication more robust later
odb_user = os.environ['ORIENTDB_USER']
odb_pass = os.environ['ORIENTDB_PASS']


def parse_arguments():
    parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    # get the server name
    if not os.environ.get('ORIENTDB_SERVER', None):
        parser.add_argument(
            '--server', help='server running the instance of orientdb', required=True)
    else:
        parser.add_argument(
            '--server', help='server running the instance of orientdb', default=os.environ['ORIENTDB_SERVER'])
    # get the port number
    if not os.environ.get('ORIENTDB_PORT', None):
        parser.add_argument(
            '--port', help='port the instance of orientdb is accessible by', type=int, required=True)
    else:
        parser.add_argument(
            '--port', help='port the instance of orientdb is accessible by',
            type=int, default=os.environ['ORIENTDB_PORT'])

    args = parser.parse_args()
    return args


class ODB:
    def __init__(self, server, port, dbname, memory_type='plocal', database_type='graph', auth=HTTPBasicAuth(odb_user, odb_pass)):
        self.server = server
        self.port = port
        self.dbname = dbname
        self.auth = auth
    
    @property
    def prefix_url(self):
        return 'http://{}:{}'.format(self.server, self.port)

    @property
    def command(self):
        return '{}/command/{}/sql'.format(self.prefix_url, self.dbname)

    def create_class(self, clsname, is_abstract=False, extends=None):
        payload = {
            'command': 'create class ?',
            'parameters': [clsname]
        }

        if extends:
            payload['command'] += ' extends {}'.format(', '.join(['?' for e in extends]))
            payload['parameters'].extend(extends)
        if is_abstract:
            payload['command'] += ' ABSTRACT'
        print(payload)
        r = requests.post(self.command, data=payload, auth=self.auth)
        print(r._content)
        return r.json()


def create_db(server, port, dbname, memory_type='plocal', database_type='graph'):
    """
    create a database in orientdb
    """
    if database_type not in ['document', 'graph']:
        raise ValueError('unsupported database type. Expected: {document,graph}. Found:', database_type)
    url = 'http://{server}:{port}/database/{dbname}/{memory_type}/{database_type}'.format(
        server=server, port=port, dbname=dbname, memory_type=memory_type, database_type=database_type)
    print(url)
    r = requests.post(url, auth=HTTPBasicAuth(odb_user, odb_pass))
    try:
        return r.json()
    except json.decoder.JSONDecodeError:
        return {'errors': [{'code': r.status_code, 'reason': r.status_code, 'content': r._content.decode('UTF-8')}]}


def main(args):
    # create the database
    j = create_db(args.server, args.port, 'test')
    print(j)
    # set up the schema
    odb = ODB(args.server, args.port, 'test')
    r = odb.create_class('test_abs')
    #r = odb.create_class('test_abs', is_abstract=True, extends=['V', 'testclass3'])
    print(r)
    # test the schema constraints?


if __name__ == '__main__':
    main(parse_arguments())
