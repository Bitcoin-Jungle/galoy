function unpack_deps() {

  echo "Unpacking deps... "

  tar -zxvf bundled-deps/bundled-deps-*.tgz ./node_modules/ ./yarn.lock -C ${REPO_PATH:-repo}/ > /dev/null

  pushd ${REPO_PATH:-repo} > /dev/null

  if [[ "$(git status -s -uno)" != "" ]]; then
    echo "Extracting deps has created a diff - deps are not in sync"
    git --no-pager diff
    exit 1;
  fi

  echo "Done!"

  popd
}
