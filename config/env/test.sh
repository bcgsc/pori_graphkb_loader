export DB_CREATE=1
# use the test keycloak server
export KEYCLOAK_KEYFILE=keycloak-dev.id_rsa.pub
export KEYCLOAK_URI=http://ga4ghdev01.bcgsc.ca:8080/auth/realms/TestKB/protocol/openid-connect/token
export LOG_LEVEL=debug
export NODE_ENV=test