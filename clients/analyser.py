import json
import matplotlib.pyplot as plt

# Lire la liste depuis le fichier results.txt
with open('results.txt', 'r') as file:
    data = file.read()
    ma_liste = json.loads(data)

# Créer un histogramme
plt.hist(ma_liste, bins=min(max(ma_liste), 20), color='blue', edgecolor='black', alpha=0.7, density=True)

# Ajouter des labels et un titre
plt.xlabel('Valeurs')
plt.ylabel('Fréquence')
plt.title('Histogramme de la Liste')

# Afficher l'histogramme
plt.show()

