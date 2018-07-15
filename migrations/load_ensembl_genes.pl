#!/projects/trans_scratch/software/perl/perl-5.20.3/bin/perl

$|++;

=pod

Pull genes (human) from ensembl and import them into the knowledgebase

=cut

use strict;
use warnings;
use Cwd;
use Cwd 'abs_path';
use File::Basename;
use Getopt::Long;
use Bio::EnsEMBL::Registry;
use Bio::EnsEMBL::ApiVersion;
use Bio::EnsEMBL::ArchiveStableId;
use Try::Tiny;
use POSIX qw(strftime);
use JSON;
use LWP::UserAgent;
use JSON::Parse 'parse_json';



my $registry;
my $host = '10.9.202.242';
my $port = 8080;
my $server_endpoint = "http://$host:$port/api/v0.0.8";
my $ua;

main();

sub getHugoFeature
{
    my ($token, $source, $sourceId, $name) = @_;
    my $sourceRID = $source;
    $sourceRID =~ s/#//;
    my $uri = "$server_endpoint/features?deletedAt=null&source=$sourceRID&sourceId=$sourceId&name=$name";
    my $req = HTTP::Request->new(GET => $uri);
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $resp = $ua->request($req);
    my $content = $resp->decoded_content;
    if ($resp->is_success) {
        my $message = parse_json($content);
        my $resultSize = scalar @{ $message->{'result'} };
        if ($resultSize == 0) {
            print "?";
        } elsif ($resultSize > 1) {
            print "x";
        } else {
            return $message->{'result'}->[0];
        }
    } else {
        print "failed request: $content from $uri\n";
    }
}

sub getGeneBySourceId
{
    my ($token, $source, $sourceId) = @_;
    my $sourceRID = $source;
    $sourceRID =~ s/#//;
    my $uri = "$server_endpoint/features?sourceId=$sourceId&deletedAt=null&source=$sourceRID&biotype=gene";
    my $req = HTTP::Request->new(GET => $uri);
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $resp = $ua->request($req);
    my $content = $resp->decoded_content;
    if ($resp->is_success) {
        my $message = parse_json($content);
        my $resultSize = scalar @{ $message->{'result'} };
        if ($resultSize == 0) {
            print "?";
        } elsif ($resultSize > 1) {
            print "x";
        } else {
            return $message->{'result'}->[0];
        }
    } else {
        print "failed request: $content from $uri\n";
        return undef;
    }
}


sub createAliasEdge
{
    my ($token, $src, $tgt, $source) = @_;
    my $req = HTTP::Request->new(POST => "$server_endpoint/aliasof");
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $content = <<"END_MESSAGE";
{
    "in": "$tgt",
    "out": "$src",
    "source": "$source"
}
END_MESSAGE
    $req->content($content);
    my $resp = $ua->request($req);
    my $message = $resp->decoded_content;
    if ($resp->is_success) {
        print ".";
        return $message;
    } else {
        if (index($message, "Cannot index record") == -1) {
            print "HTTP POST error code: ", $resp->code, "\n";
            print "HTTP POST error message: ", $resp->message, "\n";
            print "$message";
            return;
        } else {
            print "*";
        }
    }
}

sub addEnsemblGene
{
    my ($token, $gene, $source) = @_;
    my $sourceId = $gene->stable_id();
    my $req = HTTP::Request->new(POST => "$server_endpoint/features");
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $start = $gene->start();
    my $end = $gene->end();
    my $strand = $gene->strand();
    my $description = $gene->description();
    if (! defined $description) {
        $description = ""
    } else {
        $description =~ s/\s*\[.*$//;
        $description = ",\n    \"longName\": \"$description\"\n";
    }
    my $content = <<"END_MESSAGE";
{
    "sourceId": "$sourceId",
    "source": "$source",
    "start": "$start",
    "end": "$end",
    "biotype": "gene"$description
}
END_MESSAGE
    $req->content($content);
    my $resp = $ua->request($req);
    if ($resp->is_success) {
        my $message = parse_json($resp->decoded_content);
        print ".";
        return $message;
    } else {
        return getGeneBySourceId($token, $source, $sourceId);
    }
}


sub addSource
{
    my ($token, $name, $version) = @_;
    my $req = HTTP::Request->new(POST => "$server_endpoint/sources");
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    if (defined $version) {
        my $content = <<"END_MESSAGE";
{
    "name": "$name",
    "version": "$version"
}
END_MESSAGE
        $req->content($content);
    } else {
        my $content = <<"END_MESSAGE";
{
    "name": "$name"
}
END_MESSAGE
        $req->content($content);
    }
    my $resp = $ua->request($req);
    if ($resp->is_success) {
        my $message = parse_json($resp->decoded_content);
        return $message->{'result'};
    } else {
        return getSource($token, $name, $version);
    }
}


sub getSource
{
    my ($token, $name, $version) = @_;
    if (! defined $version) {
        $version = "null";
    }
    my $uri = "$server_endpoint/sources?name=$name&version=$version";
    print $uri . "\n";
    my $req = HTTP::Request->new(GET => $uri);
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $resp = $ua->request($req);
    if ($resp->is_success) {
        my $message = parse_json($resp->decoded_content);
        my $source = $message->{'result'}->[0];
        return $source;
    } else {
        print "failed getting source\n";
    }
}


sub getToken
{
    print "Getting the KB Token\n";
    my $req = HTTP::Request->new(POST => "$server_endpoint/token");
    $req->header('content-type' => 'application/json');
    my $version = software_version();
    my $username = $ENV{'USER'};
    my $password = $ENV{'PASSWORD'};
    my $content = <<"END_MESSAGE";
{
    "username": "$username",
    "password": "$password"
}
END_MESSAGE
    $req->content($content);
    my $resp = $ua->request($req);
    if ($resp->is_success) {
        my $message = parse_json($resp->decoded_content);
        return $message->{'kbToken'};
        print "LOGIN OK\n";
    } else {
        print "Failed login\n$resp";
        return undef;
    }
}


sub print_hash
{
    my ($h) = @_;
    print "$h\n";
    print "\t$_: $h->{$_}\n" for (keys %$h);
}


sub main
{
    my $database_information =  {
        -host => $ENV{'ENSEMBL_HOST'},
        -user => $ENV{'ENSEMBL_USER'},
        -port => $ENV{'ENSEMBL_PORT'},
        -pass => $ENV{'ENSEMBL_PASS'}
    };

    $registry = 'Bio::EnsEMBL::Registry';
    $registry->load_registry_from_db(%$database_information);
    # load all the different transcripts
    my $transcript_adaptor = $registry->get_adaptor('human', 'core', 'gene');
    my @glist = @{$transcript_adaptor->fetch_all()};
    my $total = scalar @glist;
    print "connecting to the user agent\n";
    $ua = LWP::UserAgent->new;

    my $token = getToken();
    print "loading $total genes\n";
    my $version = software_version();

    my $source = addSource($token, "ensembl", $version)->{'@rid'};
    my $hgncSource = addSource($token, "hgnc")->{'@rid'};
    print "ensembl source node: $source\n";
    print "hgnc source node: $hgncSource\n";
    while ( my $gene = shift @glist )
    {
        my $node = addEnsemblGene($token, $gene, $source);
        if (! defined $node) {
            next;
        }
        # add the relationship to the hugo gene
        my @xrefs = @{ $gene->get_all_object_xrefs() };
        while ( my $xref  = shift @xrefs )
        {
            if ($xref->{'dbname'} eq "HGNC") {
                my $hugo = getHugoFeature($token, $hgncSource, $xref->{'primary_id'}, $xref->{'display_id'});
                if (ref $hugo ne ref {}) {
                    next;
                }
                createAliasEdge($token, $node->{'@rid'}, $hugo->{'@rid'}, $source);
            }
        }
    }
    print "[COMPLETE] status: Complete!\n";
}

