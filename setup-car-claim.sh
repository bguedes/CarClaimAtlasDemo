#!/bin/bash

# Script pour vérifier Ollama, télécharger les modèles et lancer Docker Compose
# Usage: ./setup-car-claim.sh

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction d'affichage avec couleur
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si Ollama est installé
check_ollama() {
    print_status "Vérification de l'installation d'Ollama..."
    
    if command -v ollama >/dev/null 2>&1; then
        print_status "Ollama est installé - $(ollama --version 2>/dev/null || echo 'version inconnue')"
        return 0
    else
        print_error "Ollama n'est pas installé ou n'est pas dans le PATH"
        print_status "Pour installer Ollama, exécutez: curl -fsSL https://ollama.com/install.sh | sh"
        exit 1
    fi
}

# Fonction pour télécharger un modèle
#pull_model() {
#    local model=$1
#    print_status "Téléchargement du modèle: $model"
#    
#    if ollama pull "$model"; then
#        print_status "✓ Modèle $model téléchargé avec succès"
#    else
#        print_error "✗ Échec du téléchargement du modèle $model"
#        return 1
#    fi
#}

# Vérifier si Docker et Docker Compose sont disponibles
check_docker() {
    print_status "Vérification de Docker..."
    
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker n'est pas installé"
        exit 1
    fi
    
    # Vérifier docker compose (nouvelle syntaxe) ou docker-compose (ancienne)
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
        print_status "Docker Compose (plugin) détecté"
    elif command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker-compose"
        print_status "docker-compose (standalone) détecté"
    else
        print_error "Docker Compose n'est pas installé"
        exit 1
    fi
}

# Fonction principale
main() {
    print_status "Démarrage du script de configuration car-claim..."
    
    # Vérifications préalables
    check_ollama
    check_docker
    
    # Vérifier si le service Ollama est en cours d'exécution
    print_status "Vérification du service Ollama..."
    if ! pgrep -f ollama >/dev/null; then
        print_warning "Le service Ollama ne semble pas être en cours d'exécution"
        print_status "Démarrage d'Ollama en arrière-plan..."
        ollama serve &
        sleep 3  # Attendre que le service démarre
    fi
    
    # Télécharger les modèles requis
    print_status "Téléchargement des modèles Ollama..."
    
    MODELS=("qwen2.5-vl:7b" "mxbai-embed-large")
    
    for model in "${MODELS[@]}"; do
        # Vérifier si le modèle est déjà présent
        if ollama list | grep -q "^${model}"; then
            print_status "✓ Le modèle $model est déjà présent"
        else
            pull_model "$model"
        fi
    done
    
    # Vérifier la présence du fichier docker-compose.yml
    if [ ! -f "docker-compose.yml" ]; then
        print_warning "Fichier docker-compose.yml non trouvé dans le répertoire courant"
        print_status "Recherche dans les répertoires parents..."
        
        # Chercher le fichier dans les répertoires parents
        current_dir=$(pwd)
        found=false
        
        while [ "$current_dir" != "/" ]; do
            if [ -f "$current_dir/docker-compose.yml" ]; then
                cd "$current_dir"
                print_status "Fichier docker-compose.yml trouvé dans: $current_dir"
                found=true
                break
            fi
            current_dir=$(dirname "$current_dir")
        done
        
        if [ "$found" = false ]; then
            print_error "Fichier docker-compose.yml non trouvé"
            exit 1
        fi
    fi
    
    # Lancer Docker Compose
    print_status "Lancement de Docker Compose..."
    print_status "Commande: $DOCKER_COMPOSE_CMD up car-claim-server car-claim-client mongodb --build"
    
    # Exécuter la commande Docker Compose
    exec $DOCKER_COMPOSE_CMD up car-claim-server car-claim-client mongodb --build
}

# Gestion des signaux pour un arrêt propre
cleanup() {
    print_status "Arrêt du script..."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Exécuter le script principal
main "$@"
