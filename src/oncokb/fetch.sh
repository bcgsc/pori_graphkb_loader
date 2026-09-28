#!/usr/bin/env bash

BASE_URL='https://www.oncokb.org/api/v1'


if [ -z "${ONCOKB_TOKEN:-}" ]; then
    echo "Required environment variable ONCOKB_TOKEN is not set; aborting."
    exit 1
fi

if [ $# -eq 0 ]; then
    VERSION=$(curl -s $BASE_URL/info | grep -oP '"dataVersion"\s*:\s*\{[^}]*"version"\s*:\s*"\K[^"]+')
    echo "No OncoKB data version provided; using latest version $VERSION"
else
    VERSION=$1
fi


mkdir -p $VERSION
cd $VERSION

wget -q --show-progress \
    -O allActionableVariants.json \
    --header="Authorization: Bearer $ONCOKB_TOKEN" \
    $BASE_URL/utils/allActionableVariants?version=$VERSION

wget -q --show-progress \
    -O allAnnotatedVariants.json \
	--header="Authorization: Bearer $ONCOKB_TOKEN" \
	$BASE_URL/utils/allAnnotatedVariants?version=$VERSION

wget -q --show-progress \
    -O allCuratedGenes.json \
    --header="Authorization: Bearer $ONCOKB_TOKEN" \
    $BASE_URL/utils/allCuratedGenes?version=$VERSION

wget -q --show-progress \
    -O drugs.json \
    --header="Authorization: Bearer $ONCOKB_TOKEN" \
    $BASE_URL/drugs?version=$VERSION
