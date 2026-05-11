#!/bin/bash

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Installation Site Checker — Com d'Artisans   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Homebrew
if ! command -v brew &>/dev/null; then
  echo "📦 Installation de Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Ajouter Homebrew au PATH (Apple Silicon)
  if [[ -f /opt/homebrew/bin/brew ]]; then
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  echo "✅ Homebrew installé"
else
  echo "✅ Homebrew déjà installé"
fi

# 2. Node.js
if ! command -v node &>/dev/null; then
  echo "📦 Installation de Node.js..."
  brew install node
  echo "✅ Node.js installé"
else
  echo "✅ Node.js déjà installé ($(node -v))"
fi

# 3. Cloner le projet
echo ""
echo "📂 Clonage du projet site-checker..."
cd ~/Desktop
if [ -d "site-checker" ]; then
  echo "⚠️  Le dossier site-checker existe déjà, mise à jour..."
  cd site-checker && git pull
else
  git clone https://github.com/jeanlrz/site-checker.git
  cd site-checker
fi

# 4. Installer les dépendances
echo ""
echo "📦 Installation des dépendances npm..."
npm install

# 5. Claude Code
if ! command -v claude &>/dev/null; then
  echo ""
  echo "📦 Installation de Claude Code..."
  npm install -g @anthropic-ai/claude-code
  echo "✅ Claude Code installé"
else
  echo "✅ Claude Code déjà installé"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        ✅ Installation terminée !        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "👉 Pour lancer le projet en local :"
echo "   cd ~/Desktop/site-checker && npm run dev"
echo "   Puis ouvre http://localhost:3000"
echo ""
echo "👉 Pour ouvrir Claude Code sur ce projet :"
echo "   cd ~/Desktop/site-checker && claude"
echo ""
