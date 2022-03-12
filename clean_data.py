import os
dir = './database/chains'
for f in os.listdir(dir):
    os.remove(os.path.join(dir, f))

dir1 = './database/temp'
for f in os.listdir(dir1):
    os.remove(os.path.join(dir1, f))

dir2 = './database/files'
for f in os.listdir(dir2):
    os.remove(os.path.join(dir2, f))
