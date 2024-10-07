+++
title = 'Bitbucket to Github Migration Tool (bb2gh)'
date = 2024-10-03T22:48:27-04:00
draft = false
+++

# Bitbucket to Github Migration Tool (bb2gh)
At work, I have been tasked with migrating our Bitbucket Cloud repositories to Github. Since we are on Bitbucket Cloud, and Github's [Enterprise Importer](https://docs.github.com/en/migrations/using-github-enterprise-importer) only supports Bitbucket Server, I wrote up a quick tool to help with the migration.

Following Github's reccomended [migration process for external Git repositories](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/importing-an-external-git-repository-using-the-command-line), I used the steps they provided to create a script that would automate the process.

The tool, [bb2gh](https://github.com/JonSchaeffer/bb2gh), is a simple Golang script that will take a list of Bitbucket repositories (notated in a YAML file), clone them to a temp directory, and push them to Github using the Github CLI tool.

The main drawback with the tool is that it will only migrate Git related history. Any pull requests, comments, issues, etc., will not be migrated. 

## Usage

### Flags

> `-f` or `--file` - The file path to the `config.yaml` file.  
> `gc` or `--generate-config` - Generate a `config.yaml` file with sample data.  
> `h` or `--help` - Display the help menu.  

### Example
```bash
./bb2gh -f config.yaml
```
### General Troubleshooting

If you are having pulling or pushing repositories, ensure you have the correct permissions in both Github and Bitbucket. Ensure you are properly authenticated with the Github CLI tool. 
