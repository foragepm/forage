# Go modules support in forest

When it comes to fetching go modules from IPFS, we can use the integrity hashes provided by sum.golang.org as a content address, but rather than the hashes providing a content address directly to an archive of source code (a zip in go's case), we get a metafile which contains a list of hashes for ever file contained in the archive. Let's look at an example:

If we load the integrity hashes for [github.com/libp2p/go-libp2p-blankhost](https://github.com/libp2p/go-libp2p-blankhost), at version [0.2.0](https://github.com/libp2p/go-libp2p-blankhost/releases/tag/v0.2.0) from [sum.golang.org](https://sum.golang.org/lookup/github.com/libp2p/go-libp2p-blankhost@v0.2.0) we get the following:

```
1354545
github.com/libp2p/go-libp2p-blankhost v0.2.0 h1:3EsGAi0CBGcZ33GwRuXEYJLLPoVWyXJ1bcJzAJjINkk=
github.com/libp2p/go-libp2p-blankhost v0.2.0/go.mod h1:eduNKXGTioTuQAUcZ5epXi9vMl+t4d8ugUBRQ4SqaNQ=

go.sum database tree
3784599
7uvxIZ67TZygcq/AehTD8iHYt81Ih+Zl2Y7vXZbfszQ=

— sum.golang.org Az3grn972wXskjQrsZhVGc93fTU2uOsmSTiId1Wn1lxDCup5z4ggl1/4gaUqOkMa6cMbYvjB7hn7yemNr7Zqanol/go=
```

Focusing on the hash of the whole module (line 2), we see a base64 encoded sha2-256 of a "metafile" (`h1:3EsGAi0CBGcZ33GwRuXEYJLLPoVWyXJ1bcJzAJjINkk=`), which looks something like this:

```
c34ed9b2d37ad82752c51dab69aee4801eee4a9a0e2eafad9dc06aca4a0a3aa1  github.com/libp2p/go-libp2p-blankhost@v0.2.0/.travis.yml
9920c9d83227e8f17a56b9083ee61b9ab456e1bc647e09c036ed99a22a3dbeb9  github.com/libp2p/go-libp2p-blankhost@v0.2.0/LICENSE
cac1fa1a90910da55c8dea5c670f6fc761d7bef0c01b9796890e181941fc44e8  github.com/libp2p/go-libp2p-blankhost@v0.2.0/README.md
a72a5ea8180d6f37e6ec82618775b9a4717fdd2618452687689fae4887882636  github.com/libp2p/go-libp2p-blankhost@v0.2.0/blank.go
9687de3d33e4c005431c93e82435d6c8fb8769097abfb163af3bd3e28c1e8f94  github.com/libp2p/go-libp2p-blankhost@v0.2.0/codecov.yml
ceb28789df46b38613d98061dbd2ce11b17d03139985b3b446a318c49b5bef58  github.com/libp2p/go-libp2p-blankhost@v0.2.0/go.mod
89b8249e3f11302fffbdf5452f69209bcae6285c110d124f9f25527ed45766e9  github.com/libp2p/go-libp2p-blankhost@v0.2.0/go.sum
```

This metafile is a list of files (excluding folders) that the module contains with the sha2-256 of the contents of each file, separated by 2 spaces.

The reason that the go modules designers decided to do this rather than just hashing the zip file is that it allows them to change the compression of the zip without affecting existing integrity hashes stored in sum.golang.org.

If we assume that the almost all the individual files will be smaller than 1mb (max ipfs block size), then we can use the hashes in the metafile to be able to load each file directly from IPFS without needing to know it's CID up front.

Similarly, when a go module if first added to IPFS by forest it needs to take a different approach than just `ipfs add module.zip`, instead we download the zip file from [proxy.golang.org](https://proxy.golang.org/github.com/libp2p/go-libp2p-blankhost/@v/v0.2.0.zip), extract the files and hash each one of them with sha2-256, then combine them together to create a metafile of that module, which we add to ipfs. We then also add each individual file to IPFS as well.

The zip file can then be reconstructed by other users over IPFS purely from the integrity hash of the metafile from sum.golang.org.

The are also a couple of gotchas when reconstructing the zip files to ensure they are the same every time:

- any file dates need to be set to `Nov 30 00:00:00 1979`
- files need to be added in alphabetical order
- no unix permissions must be set on the files (set them to `0`)
- don't create folders, just add the files at the correct paths
- set the compression to `DEFLATE` at level `8`
