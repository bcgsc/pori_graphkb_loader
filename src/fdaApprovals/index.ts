import request from 'request-promise';
import parse5 from 'parse5';
import htmlToText from 'html-to-text';

import { rid } from '../graphkb';
import { logger } from '../logging';
import sourceDefns from '../sources';

const { fdaApprovals: SOURCE_DEFN } = sourceDefns;
const BASE_URL = 'https://www.fda.gov';

/**
 * Given some base node from parse5.parse find all children which match the input filter function
 */
const findElements = (document, filter, firstOnly = false) => {
    const nodes = [...document.childNodes];
    const result = [];

    while (nodes.length) {
        const current = nodes.shift();

        if (filter(current)) {
            result.push(filter(current));

            if (firstOnly) {
                return filter(current);
            }
            continue;
        }

        if (current.tagName && current.childNodes) {
            nodes.push(...current.childNodes);
        }
    }
    return result;
};

const fetchAnnouncementLinks = async (indexPageLink) => {
    const document = parse5.parse(await request(BASE_URL + indexPageLink));
    const blacklist = [
        '/drugs',
        '/drugs/development-approval-process-drugs',
        '/drugs/development-approval-process-drugs/drug-approvals-and-databases',
        '/drugs/drug-approvals-and-databases/resources-information-approved-drugs',
    ];

    const findLink = (current) => {
        if (current.tagName === 'a' && current.attrs && current.attrs.length) {
            const href = current.attrs.find(attr => attr.name === 'href');

            if (href && href.value.startsWith('/drugs') && !blacklist.includes(href.value)) {
                return href.value;
            }
        }
        return false;
    };
    const result = findElements(document, findLink);
    return Array.from(new Set(result));
};


const parseAnnouncementPage = async (link) => {
    const url = BASE_URL + link;
    const html = await request(url);

    const title = htmlToText.fromString(html, {
        baseElement: 'h1.content-title',
        ignoreHref: true,
        ignoreImage: true,
        uppercaseHeadings: false,
        wordwrap: false,
    });
    const content = htmlToText.fromString(html, {
        baseElement: 'article',
        ignoreHref: true,
        ignoreImage: true,
        uppercaseHeadings: false,
        wordwrap: false,
    });

    const record = {
        content,
        displayName: title,
        name: title,
        sourceId: link,
        url,
    };

    const years = [];

    for (const line of content.split('\n')) {
        const match = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?) \d+, (20\d\d)/gi.exec(line);

        if (match) {
            years.push(match[3]);
        }
    }

    if (new Set(years).size === 1) {
        record.year = years[0];
    }

    return record;
};


const upload = async ({ conn }) => {
    // create the source
    const source = rid(await conn.addSource(SOURCE_DEFN));
    // fetch the main page to get links
    const links = await fetchAnnouncementLinks('/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications');

    const counts = { error: 0, success: 0 };

    // pull main text from the links
    for (const link of links) {
        try {
            logger.info(`parsing: ${link}`);
            const record = await parseAnnouncementPage(link);
            await conn.addRecord({
                content: { ...record, source },
                existsOk: true,
                fetchConditions: { AND: [{ source }, { sourceId: record.sourceId }] },
                fetchExisting: false,
                target: 'CuratedContent',
            });
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(`counts: ${JSON.stringify(counts)}`);
};

export { upload };
