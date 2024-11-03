package com.github.lonelylockley.archinsight.model.annotations;

public class PlannedAnnotation extends AbstractAnnotation {
    public PlannedAnnotation() {
        super(AnnotationType.PLANNED);
    }

    @Override
    public AbstractAnnotation clone() {
        var res = new PlannedAnnotation();
        res.setValue(this.getValue());
        this.clonePositionTo(res);
        return res;
    }
}
