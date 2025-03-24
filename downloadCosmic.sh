#!/bin/bash
AUTH=$( echo "$2:$3" | base64 )
RESP=$( curl -H "Authorization: Basic $AUTH" "$4" )
URL=$( node  -e "var resp = $RESP; console.log(resp.url);" )
curl --create-dirs "$URL" -o $5/cosmic/$1/Cosmic.tar
tar -xvf $5/cosmic/$1/Cosmic.tar -C $5/cosmic/$1/
gunzip -f $5/cosmic/$1/*.tsv.gz # should only have one 
