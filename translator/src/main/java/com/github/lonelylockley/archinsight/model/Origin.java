package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import com.github.lonelylockley.archinsight.model.remote.translator.TabData;
import com.github.lonelylockley.archinsight.repository.FileSystem;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public class Origin {

    private final Optional<FileData> file;
    private final Optional<TabData> tab;

    private Optional<String> location = Optional.empty();

    public Origin(TabData tab) {
        this.tab = Optional.of(tab);
        this.file = Optional.empty();
    }

    public Origin(FileData file) {
        this.tab = Optional.empty();
        this.file  = Optional.of(file);
    }

    public Origin(Optional<FileData> file, TabData tab) {
        this.tab = Optional.of(tab);
        this.file = file;
    }

    public Optional<FileData> getFile() {
        return file;
    }

    public String getLocation() {
        return location.orElse(null);
    }

    public Optional<TabData> getTab() {
        return tab;
    }

    public String getTabId() {
        return tab.map(TabData::getTabId).orElse(null);
    }

    public UUID getFileId() {
        return file.map(FileData::getId).orElse(null);
    }

    public void defineLocation(FileSystem fs) {
        this.location = file.isPresent() ? Optional.of(fs.getPath(getFileId())) : tab.map(TabData::getFileName);
    }

    public String getContent() {
        return tab.map(TabData::getSource).orElse(file.map(FileData::getContent).orElse(null));
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Origin other = (Origin) o;
        // first, compare by tab
        if (tab.isPresent() && other.tab.isPresent()) {
            return Objects.equals(tab.get().getTabId(), other.tab.get().getTabId());
        }
        else // compare by file
        if (file.isPresent() && other.file.isPresent()) {
            return Objects.equals(file.get().getId(), other.file.get().getId());
        }
        else {
            return false;
        }
    }

    @Override
    public int hashCode() {
        if (tab.isPresent()) {
            return Objects.hash(tab.get().getTabId());
        }
        else
        if (file.isPresent()) {
            return Objects.hash(file.get().getId());
        }
        else {
            return super.hashCode();
        }
    }

    @Override
    public String toString() {
        return "Origin{" +
                "fileid=" + getFileId() +
                ", tabid=" + getTabId() +
                '}';
    }
}
