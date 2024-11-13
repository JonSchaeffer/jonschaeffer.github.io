+++
title = 'Managing PostgreSQL pg_wal Growth: Troubleshooting and Solutions'
date = 2024-11-13T17:33:08-05:00
draft = false
+++


Recently, I've noticed that my TimescaleDB PostgreSQL clusters have experienced significant growth in their pg_wal volumes, sometimes expanding to over 20GB or even filling up the data disk entirely. This has occasionally led to the data volume running out of space quickly, causing access issues on the database. My goal is to spend less time fixing and worrying about these databases.

The first step is identifying what causes the pg_wal folder to exceed its expected size (about 2GB). Potential causes include replication lag, incorrect WAL configuration, failed backups, etc.

### Troubleshooting steps

High replication lag can cause WAL size to inflate. To check for this, we can examine the pg_stat_replication table. Running the query below provides statistics on our replication slots:

```sql
SELECT * FROM pg_stat_replication;
```

I will focus on `write_lag`, `flush_lag`, and `replay_lag`. If these values are high, it could indicate an issue with replicas streaming data from the primary node.

Example output:
```sql
postgres=# SELECT * FROM pg_stat_replication;
  pid   | usesysid |  usename   | application_name | client_addr |               client_hostname                | client_port |         backend_start         | backend_xmin |   state   |  sent_lsn   |  write_lsn  |  flush_lsn  | replay_lsn  |    write_lag    |    flush_lag    |   replay_lag    | sync_priority | sync_state |          reply_time
--------+----------+------------+------------------+-------------+----------------------------------------------+-------------+-------------------------------+--------------+-----------+-------------+-------------+-------------+-------------+-----------------+-----------------+-----------------+---------------+------------+-------------------------------
 434726 |    16384 | replicator | timescale-2      | 10.0.0.111  | timescale-2.c.gumband-v2-production.internal |       29188 | 2024-10-22 13:20:51.299949+00 |              | streaming | 1D/6B679988 | 1D/6B679988 | 1D/6B679988 | 1D/6B679988 | 00:00:00.000575 | 00:00:00.001661 | 00:00:00.001782 |             0 | async      | 2024-11-13 16:34:01.159582+00
 434744 |    16384 | replicator | timescale-3      | 10.0.0.112  | timescale-3.c.gumband-v2-production.internal |       45948 | 2024-10-22 13:20:53.585643+00 |              | streaming | 1D/6B679988 | 1D/6B679988 | 1D/6B679988 | 1D/6B679988 | 00:00:00.000618 | 00:00:00.001797 | 00:00:00.001901 |             0 | async      | 2024-11-13 16:34:00.357485+00
```
In my case, the `write_lag`, `flush_lag`, and `replay_lag` are all very low, indicating that the replicas are keeping up with the primary server's WAL generation. This appears to be OK.

#### WAL Configuration

My `/etc/patroni/patroni.yml` configuration is set using an Ansible script, so I don't expect any issues here. However, it's good to double-check that my values are set accordingly.

Here are my main wal settings:
```yaml
min_wal_size: "512MB" 
max_wal_size: "1GB" 
wal_level: "replica" 
wal_keep_size: "2GB" 
max_wal_senders: "10"
```

This does not explain why the Primary node's `pg_wal` folder is 18GB. Let's keep going.

#### Check Replication Slot Activity

We may be able to extrapolate some information from replication slot activity. If we see a lot of inactive slots that could indicate to us why our `pg_wal` directory is filling up. Lets list all replication slots and verify their activity status.

```sql
SELECT slot_name, active, restart_lsn FROM pg_replication_slots;
```

```sql
SELECT slot_name, active, restart_lsn FROM pg_replication_slots;
  slot_name  | active | restart_lsn
-------------+--------+-------------
 timescale_2 | t      | 1D/6B8FA368
 timescale_3 | t      | 1D/6B8FA368

```

Both replication slots (timescale_2 and timescale_3) are active, which is good because it means they are being used by the cluster's replicas.

#### Checking PostgreSQL logs for hints

Ahh, PostgreSQL logs. I should have checked here first! Looking at the logs, the issue is pretty obvious: 
```txt
ERROR: [041]: unable to get info for path/file '/tmp/pgbackrest/main.stop': [13] Permission denied 2024-11-13 16:46:40 UTC [434699-211272] 
LOG: archive command failed with exit code 41 2024-11-13 16:46:40 UTC [434699-211273] 

DETAIL: The failed archive command was: pgbackrest --stanza=main archive-push pg_wal/000000030000001900000003 2024-11-13 16:46:40 UTC [434699-211274] 

WARNING: archiving write-ahead log file "000000030000001900000003" failed too many times, will try again later
```

I use `pgbackrest` to backup my clusters. I have a `full` backup that runs once every week, and a `diff` backup that runs every night. According to the logs, postgres is unable to write in the `/tmp/pgbackrest` folder. Pgbackrest will place its lock file here when performing backups.

Long story short, the default `lock-path` folder for `pgbackrest` is located at `tmp/pgbackrest`. When running a script that triggers `pgbackrest`, the `tmp` folder gets created as root. Which is inaccessible by `postgres`.

### Let's Fix it!

#### Option 1

First, lets set the owner of the problem directory to `postgres:postgres`. 
```bash
sudo chown postgres:postgres /tmp/pgbackrest
```

Now, I can run the pgbackrest backup command
`pgbackrest --stanza=main backup --type full`

Note: This may fail a couple times to start as postgres recycles unneeded wal segments. At least this is what happened in my case.

###### Making it Repeatable

To ensure that this tmp directory is always created with Postgres as the owner, we can use a tool called `systemd-tmpfiles`. On reboot, it will ensure that the specified folder is present with the correct ownership. Our conf file would look like this:
```conf
d /tmp/pgbackrest 750 postgres postgres -
```

We can test that this works by deleting the folder, then running:
```bash
sudo systemd-tmpfiles --create /etc/tmpfiles.d/postgres.conf
```

Performing a reboot, we will see the `/tmp/pgbackrest` folder created with the correct permissions.

#### Option 2

There is a more stateful and descriptive way of doing this. We can set the `lock-path` in our `pgbackrest.conf`. Essentially, you need to add `lock-path=/path/to/dir` to your `pgbackrest.conf` file. This should make the folder persistent on reboots. We will only have to create the folder and set permissions once. 

I deployed `pgbackrest` with a custom ansible playbook, so I can update the config in one place and propagate it to all of my nodes.

First, we will update the `pgbackrest.conf` file: 
```bash
[global]
repo1-type=gcs
repo1-gcs-bucket={{ gcs_bucket_name }}
repo1-gcs-endpoint=storage.googleapis.com
repo1-gcs-key-type=service
repo1-gcs-key=/path/to/key
repo1-retention-full=1
#Here is where we can add the lock-path
lock-path=/home/postgres/pgbackrest-backup

[main]
pg1-path=/mnt/postgresql/15/main
pg1-user=postgres

```

Second, I will adjust my `deploy_pgbackrest.yaml` to make sure the `/home/postgres/pgbackrest-backup` folder is present on the system with the correct permissions.
```ansible
    - name: Create pgbackrest-backup directory
      file:
        path: /home/postgres/pgbackrest-backup
        state: directory
        owner: postgres
        group: postgres
        mode: "750"

```
This step should take care of it.

I can deploy the updated config with `ansible-playbook deploy_pgbackrest.yml --ask-vault-pass`. 

Now we don't have to worry about the `lock-path` directory being deleted from the `/tmp` directory when the system is rebooted.

This approach is preferable because the steps are well-defined in my Ansible script. It allows me to easily see from the `pgbackrest.conf` file where the backups are meant to take place, making troubleshooting cleaner and more straightforward. I generally think this approach is a little cleaner, too.


### Takeaways

This experience was a good reminder of the importance of monitoring and maintaining our database environments. Fortunately, this issue only affected my non-production PostgreSQL clusters, allowing me to address it without impacting production. In production, I have  alerting mechanisms to notify me if disks exceed 80% capacity, nodes become unavailable, or backups fail to complete.

This was a fun way to spend an afternoon and it narrowed down some frustrations in our testing environments. Moving forward, I may consider implementing alerts for our non-production clusters, although I'm cautious about potential alert fatigue obscuring critical notifications.
