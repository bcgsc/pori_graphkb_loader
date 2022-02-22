# Node
export PATH=/gsc/software/linux-x86_64-centos7/node-12.16.1/bin:$PATH
# G++ (GCC)
export PATH=/gsc/software/linux-x86_64-centos7/gcc-7.2.0/bin:$PATH
export LD_LIBRARY_PATH=/gsc/software/linux-x86_64-centos7/gcc-7.2.0/lib64
# Others. Necessary?
export PATH=/usr/pgsql-9.4/bin:$PATH
export PATH=/gsc/software/linux-x86_64-centos7/python-3.7.2/bin:$PATH

# Export environment variables for authentification via Keycloak?
export JIRA_PASS=$JIRA_PASS

# See current version
echo 'node --> ' $(which node)
echo 'g++  --> ' $(which g++)
# See environment variables
printenv | grep JIRA
