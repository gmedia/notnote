set +e
echo "host=$(hostname)"
TOKEN=$(awk '/oauth_token:/{print $2}' "$HOME/.config/gh/hosts.yml" 2>/dev/null | tr -d '"' | head -1)
echo "token_prefix=$(printf '%s' "$TOKEN" | cut -c1-16)"
echo "token_fp=$(printf '%s' "$TOKEN" | sha256sum | cut -c1-12)"
echo "scopes=$(gh auth status 2>&1 | sed -n 's/.*Token scopes: //p' | head -1 | tr -d "'")"
echo "login=$(gh api user --jq .login 2>/dev/null)"
echo "repo_push=$(gh api "repos/__REPO__" --jq .permissions.push 2>/dev/null)"
echo "repo_admin=$(gh api "repos/__REPO__" --jq .permissions.admin 2>/dev/null)"
echo "ssh_keys=$(for k in "$HOME"/.ssh/*.pub; do [ -e "$k" ] && ssh-keygen -lf "$k" 2>/dev/null | awk '{print $2}'; done | paste -sd, -)"
echo "transcript_hits=$(timeout 25 grep -rhoE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}' "$HOME/.claude/transcripts" 2>/dev/null | wc -l | tr -d ' ')"
echo "history_hits=$(cat "$HOME"/.bash_history "$HOME"/.zsh_history 2>/dev/null | grep -cE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_' | tr -d ' ')"
exit 0
