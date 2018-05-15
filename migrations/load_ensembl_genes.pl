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
my $token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Im5hbWUiOiJhZG1pbiIsIkByaWQiOiIjNDE6MCJ9LCJpYXQiOjE1MjQyNDgwODgsImV4cCI6MTE1MjQyNDgwODh9.-PkTFeYCB7NyNs0XOap3ptPTp3icWxGbEBi2Hlku-kQ';
my $server_endpoint = "http://$host:$port/api";
my $ua;

main();

sub getFeatureByName
{
    my ($name) = @_;
    my $uri = "$server_endpoint/independantfeatures?name=$name&deletedAt=null";
    my $req = HTTP::Request->new(GET => $uri);
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $resp = $ua->request($req);
    my $content = $resp->decoded_content;
    if ($resp->is_success) {
        my $message = parse_json($content);
        return $message->[0];
    } else {
        print "failed request: $content from $uri\n";
        return undef;
    }
}


sub createAliasEdge
{
    my ($src, $tgt) = @_;
    my $req = HTTP::Request->new(POST => "$server_endpoint/aliasof");
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $content = <<"END_MESSAGE";
{
    "in": "$tgt",
    "out": "$src"
}
END_MESSAGE
    $req->content($content);
    my $resp = $ua->request($req);
    my $message = $resp->decoded_content;
    if ($resp->is_success) {
        print "-";
        return $message;
    } else {
        if (index($message, "Cannot index record") == -1) {
            print "HTTP POST error code: ", $resp->code, "\n";
            print "HTTP POST error message: ", $resp->message, "\n";
            print "$message";
            return;
        } else {
            print "=";
        }
    }
}


sub createHugoGene
{
    my ($name) = @_;
    my $req = HTTP::Request->new(POST => "$server_endpoint/independantfeatures");
    $req->header('content-type' => 'application/json');
    $req->header('Authorization' => $token);
    my $content = <<"END_MESSAGE";
{
    "name": "$name",
    "source": "hgnc",
    "biotype": "gene"
}
END_MESSAGE
    $req->content($content);
    my $resp = $ua->request($req);
    $content = $resp->decoded_content;
    if ($resp->is_success) {
        print "H";
        my $json = parse_json($content);
        return $json;
    } else {
        print "ERROR: $content\n";
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

    print "loading $total genes\n";

    my $source = "ensembl";
    my $sourceVersion = software_version();
    while ( my $gene = shift @glist )
    {
        my $name = $gene->stable_id();
        my $req = HTTP::Request->new(POST => "$server_endpoint/independantfeatures");
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
    "sourceId": "$name",
    "source": "$source",
    "sourceVersion": "$sourceVersion",
    "start": "$start",
    "end": "$end",
    "biotype": "gene"$description
}
END_MESSAGE
        $req->content($content);
        my $resp = $ua->request($req);
        if ($resp->is_success) {
            my $message = $resp->decoded_content;
            print ".";
        }
        else {
            my $temp = $resp->decoded_content;
            if (index($temp, "Cannot index record") == -1) {
                print "HTTP POST error code: ", $resp->code, "\n";
                print "HTTP POST error message: ", $resp->message, "\n";
                print "$req\n";
                print "$temp";
                last;
            } else {
                print "*";
            }
        }
        # now add the relationships to other databases
        if ($gene->external_db() eq 'HGNC') {
            my $hugoname = $gene->external_name();
            # get the hugo gene from the db
            my $hugo = getFeatureByName($hugoname);
            if (! defined $hugo) {
                next;
            }
            my $ensg = getFeatureByName($name);
            if (defined $ensg && defined $hugo) {
                createAliasEdge($ensg->{'@rid'}, $hugo->{'@rid'});
            }
        }
    }
    print "[COMPLETE] status: Complete!\n";
}

