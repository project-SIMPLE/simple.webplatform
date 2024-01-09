import json
import matplotlib.pyplot as plt
import numpy as np

# Charger les données depuis le fichier JSON
with open("clients/results_measurer.json", "r") as file:
    data = json.load(file)

# Extraire les données
length_messages = [entry["length_messages"] for entry in data]
lost_ratio = [entry["nb_lost"] / (entry["nb_lost"] + entry["nb_success"]) * 100 for entry in data]

# Créer le graphique
fig, ax1 = plt.subplots(figsize=(10, 6))

# Tracer la première courbe sur l'axe principal (Médiane des durées)
ax1.set_xscale("log")  # Échelle log sur l'axe des x
ax1.set_xlabel("Message size (byte)")
ax1.set_yscale("log")
ax1.set_ylabel("Duration median (s)", color='blue')
ax1.grid()

# Tracer la première courbe
ax1.plot(length_messages, [entry["med_durations"] for entry in data], marker='o', linestyle='-', color='blue', label='Duration Median')
ax1.tick_params(axis='y', labelcolor='blue')
ax1.set_title("Performance of the communication according to the size of messages")

# Créer un axe secondaire partageant le même axe x
ax2 = ax1.twinx()
ax2.set_ylabel("Lost Ratio (%)", color='red')

# Tracer la deuxième courbe sur l'axe secondaire (Ratio de pertes)
ax2.plot(length_messages, lost_ratio, marker='o', linestyle='-', color='red', label='Lost Ratio')
ax2.tick_params(axis='y', labelcolor='red')

# Ajouter une légende combinant les deux courbes
lines, labels = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax2.legend(lines + lines2, labels + labels2, loc='upper left')

# Ajouter une barre verticale à x=10^6
ax1.axvline(x=1.5*10**6, color='black', linestyle='--', lw=2, label='Vertical Line at x=10^6')

# Ajouter un texte le long de la barre verticale
ax1.text(2*10**6, ax1.get_ylim()[0]+0.1, "Size limit for good performance", rotation='vertical', verticalalignment='bottom', color='black')


# Ajuster l'espacement
fig.tight_layout()

# Afficher le graphique
plt.show()
